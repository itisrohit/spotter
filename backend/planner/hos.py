"""Trip scheduling rules for the Spotter assessment MVP.

The planner models a property-carrying driver on the assessment's 70/8
assumption. It deliberately keeps route acquisition separate: callers provide
route miles and estimated driving hours, and this module returns duty-status
segments that can be rendered on an ELD log.
"""

from dataclasses import asdict, dataclass
from math import ceil


MAX_DRIVING_HOURS = 11.0
MAX_WINDOW_HOURS = 14.0
BREAK_AFTER_DRIVING_HOURS = 8.0
BREAK_HOURS = 0.5
DAILY_RESTART_HOURS = 10.0
CYCLE_LIMIT_HOURS = 70.0
CYCLE_RESTART_HOURS = 34.0
FUEL_INTERVAL_MILES = 1000.0
SERVICE_HOURS = 1.0
FUEL_HOURS = 0.5


@dataclass(frozen=True)
class RouteLeg:
    name: str
    miles: float
    drive_hours: float
    destination: str


@dataclass(frozen=True)
class DutySegment:
    start_hour: float
    duration_hours: float
    status: str
    location: str
    activity: str

    @property
    def end_hour(self) -> float:
        return self.start_hour + self.duration_hours

    def to_dict(self) -> dict:
        value = asdict(self)
        value['end_hour'] = round(self.end_hour, 2)
        return value


class HOSPlanningError(ValueError):
    """Raised when route input cannot be planned safely."""


LOG_STATUSES = ('OFF_DUTY', 'SLEEPER', 'DRIVING', 'ON_DUTY')


def build_daily_logs(segments: list[DutySegment]) -> list[dict]:
    """Split absolute duty segments into 24-hour ELD log days.

    Empty time between planned activities is explicitly represented as
    off-duty so every log has four status totals that add up to 24 hours.
    """
    if not segments:
        return []

    total_hours = max(segment.end_hour for segment in segments)
    day_count = max(1, ceil(total_hours / 24))
    logs = []

    for day_index in range(day_count):
        day_start = day_index * 24
        day_end = day_start + 24
        cursor = 0.0
        day_segments = []

        def append_segment(start_hour, duration_hours, status, location, activity):
            if duration_hours <= 0:
                return
            day_segments.append({
                'start_hour': round(start_hour, 2),
                'duration_hours': round(duration_hours, 2),
                'end_hour': round(start_hour + duration_hours, 2),
                'status': status,
                'location': location,
                'activity': activity,
            })

        for segment in segments:
            if segment.end_hour <= day_start or segment.start_hour >= day_end:
                continue
            local_start = max(segment.start_hour, day_start) - day_start
            local_end = min(segment.end_hour, day_end) - day_start
            if local_start > cursor:
                append_segment(cursor, local_start - cursor, 'OFF_DUTY', segment.location, 'Off duty')
            append_segment(local_start, local_end - local_start, segment.status, segment.location, segment.activity)
            cursor = local_end

        if cursor < 24:
            append_segment(cursor, 24 - cursor, 'OFF_DUTY', '—', 'Off duty')

        totals = {status: 0.0 for status in LOG_STATUSES}
        for segment in day_segments:
            totals[segment['status']] += segment['duration_hours']
        totals = {status: round(hours, 2) for status, hours in totals.items()}
        remarks = [
            {
                'time': segment['start_hour'],
                'location': segment['location'],
                'activity': segment['activity'],
            }
            for segment in day_segments
            if segment['activity'] != 'Off duty'
        ]
        logs.append({
            'day': day_index + 1,
            'segments': day_segments,
            'totals': totals,
            'remarks': remarks,
        })

    return logs


def _validate_route_leg(leg: RouteLeg) -> None:
    if leg.miles < 0:
        raise HOSPlanningError('Route miles cannot be negative.')
    if leg.drive_hours < 0:
        raise HOSPlanningError('Drive hours cannot be negative.')
    if leg.miles == 0 and leg.drive_hours > 0:
        raise HOSPlanningError('A zero-mile leg cannot have drive time.')


def plan_trip(
    *,
    current_location: str,
    pickup_location: str,
    dropoff_location: str,
    current_cycle_used: float,
    route_legs: list[RouteLeg],
    pickup_hours: float = SERVICE_HOURS,
    dropoff_hours: float = SERVICE_HOURS,
    fuel_interval_miles: float = FUEL_INTERVAL_MILES,
) -> list[DutySegment]:
    """Return a legal sequence of duty segments for the supplied route.

    The sequence begins with a 30-minute pre-trip inspection. It inserts
    30-minute breaks, 10-hour daily rests, 34-hour cycle restarts, one-hour
    pickup/dropoff service, and half-hour fuel stops as needed.
    """

    if not current_location or not pickup_location or not dropoff_location:
        raise HOSPlanningError('All three locations are required.')
    if not 0 <= current_cycle_used < CYCLE_LIMIT_HOURS:
        raise HOSPlanningError('current_cycle_used must be between 0 and 70 hours.')
    if fuel_interval_miles <= 0:
        raise HOSPlanningError('fuel_interval_miles must be positive.')
    for leg in route_legs:
        _validate_route_leg(leg)

    segments: list[DutySegment] = []
    absolute_hour = 0.0
    shift_elapsed = 0.0
    drive_in_shift = 0.0
    drive_since_break = 0.0
    cycle_hours = current_cycle_used
    miles_since_fuel = 0.0
    total_miles = 0.0
    next_fuel_mile = fuel_interval_miles

    def add(status: str, duration: float, location: str, activity: str) -> None:
        nonlocal absolute_hour, shift_elapsed, cycle_hours, drive_since_break
        if duration <= 0:
            return
        segments.append(DutySegment(absolute_hour, duration, status, location, activity))
        absolute_hour += duration
        if status in {'ON_DUTY', 'DRIVING'}:
            shift_elapsed += duration
            cycle_hours += duration
        if status != 'DRIVING':
            drive_since_break = 0.0 if duration >= BREAK_HOURS else drive_since_break

    def add_daily_rest(location: str) -> None:
        nonlocal shift_elapsed, drive_in_shift, drive_since_break
        add('SLEEPER', DAILY_RESTART_HOURS, location, '10-hour daily rest')
        shift_elapsed = 0.0
        drive_in_shift = 0.0
        drive_since_break = 0.0

    def add_cycle_restart(location: str) -> None:
        nonlocal cycle_hours, shift_elapsed, drive_in_shift, drive_since_break
        add('OFF_DUTY', CYCLE_RESTART_HOURS, location, '34-hour cycle restart')
        cycle_hours = 0.0
        shift_elapsed = 0.0
        drive_in_shift = 0.0
        drive_since_break = 0.0

    def ensure_on_duty_capacity(duration: float, location: str) -> None:
        nonlocal shift_elapsed
        if cycle_hours + duration > CYCLE_LIMIT_HOURS:
            add_cycle_restart(location)
        if shift_elapsed + duration > MAX_WINDOW_HOURS:
            add_daily_rest(location)

    def add_service(location: str, duration: float, activity: str) -> None:
        nonlocal drive_since_break
        ensure_on_duty_capacity(duration, location)
        add('ON_DUTY', duration, location, activity)
        if duration >= BREAK_HOURS:
            drive_since_break = 0.0

    add_service(current_location, 0.5, 'Pre-trip inspection')

    for leg in route_legs:
        remaining_miles = leg.miles
        remaining_drive_hours = leg.drive_hours
        while remaining_drive_hours > 0.0001:
            if cycle_hours >= CYCLE_LIMIT_HOURS:
                add_cycle_restart(leg.destination)
            if shift_elapsed >= MAX_WINDOW_HOURS or drive_in_shift >= MAX_DRIVING_HOURS:
                add_daily_rest(leg.destination)
            if drive_since_break >= BREAK_AFTER_DRIVING_HOURS:
                add('OFF_DUTY', BREAK_HOURS, leg.destination, '30-minute rest break')

            window_drive_capacity = MAX_WINDOW_HOURS - shift_elapsed
            cycle_drive_capacity = CYCLE_LIMIT_HOURS - cycle_hours
            drive_capacity = min(
                MAX_DRIVING_HOURS - drive_in_shift,
                window_drive_capacity,
                cycle_drive_capacity,
                BREAK_AFTER_DRIVING_HOURS - drive_since_break,
                remaining_drive_hours,
            )
            if drive_capacity <= 0.0001:
                add_daily_rest(leg.destination)
                continue

            ratio = remaining_miles / remaining_drive_hours if remaining_drive_hours else 0
            miles_capacity = drive_capacity * ratio
            until_fuel = next_fuel_mile - total_miles
            drive_hours = drive_capacity
            miles = miles_capacity
            activity = f'Drive: {leg.name}'
            if until_fuel > 0 and until_fuel < miles:
                miles = until_fuel
                drive_hours = remaining_drive_hours * (miles / remaining_miles)

            location = leg.destination if miles >= remaining_miles - 0.001 else f'En route ({total_miles + miles:.0f} mi)'
            add('DRIVING', drive_hours, location, activity)
            remaining_drive_hours -= drive_hours
            remaining_miles -= miles
            total_miles += miles
            miles_since_fuel += miles
            drive_in_shift += drive_hours
            drive_since_break += drive_hours

            if abs(total_miles - next_fuel_mile) < 0.01:
                add_service(location, FUEL_HOURS, 'Fueling')
                miles_since_fuel = 0.0
                next_fuel_mile += fuel_interval_miles

        add_service(leg.destination, SERVICE_HOURS if leg.destination == pickup_location else 0, 'Pickup')
        if leg.destination == dropoff_location:
            add_service(leg.destination, dropoff_hours, 'Drop-off')

    # If the route legs do not identify service locations, the caller still
    # receives a predictable schedule by adding the required pickup/drop-off.
    destinations = {leg.destination for leg in route_legs}
    if pickup_location not in destinations:
        add_service(pickup_location, pickup_hours, 'Pickup')
    if dropoff_location not in destinations:
        add_service(dropoff_location, dropoff_hours, 'Drop-off')

    return segments
