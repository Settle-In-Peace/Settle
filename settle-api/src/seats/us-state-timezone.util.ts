/**
 * US state → primary IANA timezone (majority-population zone for
 * multi-timezone states). Used to evaluate the FDCPA/TCPA 8am–9pm
 * consumer-local calling window for the agent work queue.
 *
 * Returns 'unknown' when no consumer state is on file — the dashboard
 * surfaces it so the agent confirms local time before dialing.
 */
export const US_STATE_TIMEZONE: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix',
  AR: 'America/Chicago', CA: 'America/Los_Angeles', CO: 'America/Denver',
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Denver', IL: 'America/Chicago', IN: 'America/New_York',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York',
  LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver',
  NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York',
  RI: 'America/New_York', SC: 'America/New_York', SD: 'America/Chicago',
  TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
};

export type FdcpaWindowStatus = 'ok' | 'outside' | 'unknown';

export interface FdcpaWindow {
  status: FdcpaWindowStatus;
  /** Consumer-local hour (0-23) when a timezone could be resolved. */
  localHour?: number;
  timeZone?: string;
  state?: string;
}

/** FDCPA §805(a)(1)/TCPA: calls only between 8am and 9pm consumer local time. */
export function fdcpaCallWindow(state?: string, at: Date = new Date()): FdcpaWindow {
  const tz = state ? US_STATE_TIMEZONE[state.toUpperCase()] : undefined;
  if (!tz) return { status: 'unknown', state };
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }).format(at),
  );
  return {
    status: localHour >= 8 && localHour < 21 ? 'ok' : 'outside',
    localHour,
    timeZone: tz,
    state: state?.toUpperCase(),
  };
}
