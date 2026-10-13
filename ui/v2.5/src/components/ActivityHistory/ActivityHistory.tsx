import React, { useMemo, useState } from "react";
import { Button, ButtonGroup, Form, Table } from "react-bootstrap";
import { FormattedMessage, useIntl } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { DateInput } from "src/components/Shared/DateInput";
import { LoadingIndicator } from "src/components/Shared/LoadingIndicator";
import { useConfigurationContext } from "src/hooks/Config";
import TextUtils from "src/utils/text";
import { HistoryBarChart, IHistoryBucket } from "./HistoryBarChart";

type RangePreset = "7d" | "30d" | "90d" | "1y" | "all" | "custom";
type GroupBy = "day" | "week" | "month";

const presets: { id: RangePreset; days?: number }[] = [
  { id: "7d", days: 7 },
  { id: "30d", days: 30 },
  { id: "90d", days: 90 },
  { id: "1y", days: 365 },
  { id: "all" },
  { id: "custom" },
];

const PLAY_COLOR = "#3d8fdc";
const O_COLOR = "#d9688f";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function parseDay(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// returns the start of the bucket containing d, in local time
function bucketStart(d: Date, groupBy: GroupBy) {
  switch (groupBy) {
    case "week": {
      // weeks start on Monday
      const day = startOfDay(d);
      return addDays(day, -((day.getDay() + 6) % 7));
    }
    case "month":
      return new Date(d.getFullYear(), d.getMonth(), 1);
    default:
      return startOfDay(d);
  }
}

function nextBucket(d: Date, groupBy: GroupBy) {
  switch (groupBy) {
    case "week":
      return addDays(d, 7);
    case "month":
      return new Date(d.getFullYear(), d.getMonth() + 1, 1);
    default:
      return addDays(d, 1);
  }
}

interface IBucketRow {
  key: string;
  start: Date;
  plays: number;
  os: number;
}

function buildBuckets(
  start: Date,
  end: Date,
  groupBy: GroupBy,
  playDates: Date[],
  oDates: Date[]
) {
  const rows: IBucketRow[] = [];
  const byKey = new Map<string, IBucketRow>();

  for (
    let d = bucketStart(start, groupBy);
    d <= end;
    d = nextBucket(d, groupBy)
  ) {
    const row = { key: TextUtils.dateToString(d), start: d, plays: 0, os: 0 };
    rows.push(row);
    byKey.set(row.key, row);
  }

  const keyOf = (d: Date) => TextUtils.dateToString(bucketStart(d, groupBy));

  for (const d of playDates) {
    const row = byKey.get(keyOf(d));
    if (row) row.plays++;
  }
  for (const d of oDates) {
    const row = byKey.get(keyOf(d));
    if (row) row.os++;
  }

  return rows;
}

export const ActivityHistory: React.FC = () => {
  const intl = useIntl();
  const { configuration } = useConfigurationContext();
  const { sfwContentMode } = configuration.interface;

  const [preset, setPreset] = useState<RangePreset>("30d");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [showTable, setShowTable] = useState(false);

  const today = startOfDay(new Date());
  const todayKey = TextUtils.dateToString(today);
  const [customStart, setCustomStart] = useState(
    TextUtils.dateToString(addDays(today, -29))
  );
  const [customEnd, setCustomEnd] = useState(todayKey);

  // the inclusive day range requested; undefined start means "all time"
  const range = useMemo(() => {
    const now = parseDay(todayKey)!;
    if (preset === "custom") {
      const s = parseDay(customStart);
      const e = parseDay(customEnd);
      if (!s || !e || s > e) return;
      return { start: s, end: e };
    }
    const days = presets.find((p) => p.id === preset)?.days;
    return {
      start: days ? addDays(now, -(days - 1)) : undefined,
      end: now,
    };
  }, [preset, customStart, customEnd, todayKey]);

  const { data, loading, error } = GQL.useSceneActivityHistoryQuery({
    skip: !range,
    fetchPolicy: "cache-and-network",
    variables: {
      start: range?.start?.toISOString(),
      // end is exclusive, so include the whole of the last day
      end: range ? addDays(range.end, 1).toISOString() : undefined,
    },
  });

  const playDates = useMemo(
    () =>
      (data?.sceneActivityHistory.play_dates ?? []).map(
        (d: string) => new Date(d)
      ),
    [data]
  );
  const oDates = useMemo(
    () =>
      (data?.sceneActivityHistory.o_dates ?? []).map(
        (d: string) => new Date(d)
      ),
    [data]
  );

  const rows = useMemo(() => {
    if (!range) return [];

    let { start } = range;
    if (!start) {
      // all time - start from the earliest recorded activity
      const first = Math.min(
        ...[playDates[0], oDates[0]]
          .filter((d) => d !== undefined)
          .map((d) => d.getTime())
      );
      start = Number.isFinite(first) ? startOfDay(new Date(first)) : range.end;
    }

    return buildBuckets(start, range.end, groupBy, playDates, oDates);
  }, [range, groupBy, playDates, oDates]);

  function formatBucket(d: Date, full: boolean) {
    switch (groupBy) {
      case "month":
        return intl.formatDate(d, {
          month: full ? "long" : "short",
          year: "numeric",
        });
      case "week": {
        const label = intl.formatDate(d, {
          day: "numeric",
          month: "short",
          year: full ? "numeric" : undefined,
        });
        return full
          ? intl.formatMessage({ id: "stats.history.week_of" }, { date: label })
          : label;
      }
      default:
        return intl.formatDate(d, {
          day: "numeric",
          month: "short",
          year: full ? "numeric" : undefined,
          weekday: full ? "short" : undefined,
        });
    }
  }

  function toChartBuckets(value: (r: IBucketRow) => number): IHistoryBucket[] {
    return rows.map((r) => ({
      key: r.key,
      axisLabel: formatBucket(r.start, false),
      label: formatBucket(r.start, true),
      value: value(r),
    }));
  }

  const playBuckets = toChartBuckets((r) => r.plays);
  const oBuckets = toChartBuckets((r) => r.os);

  const totalPlays = rows.reduce((acc, r) => acc + r.plays, 0);
  const totalOs = rows.reduce((acc, r) => acc + r.os, 0);

  const oTitleID = sfwContentMode
    ? "stats.history.o_history_sfw"
    : "stats.history.o_history";
  const oCountID = sfwContentMode ? "o_count_sfw" : "o_count";

  const formatPlays = (v: number) =>
    intl.formatMessage({ id: "stats.history.plays" }, { count: v });
  const formatOs = (v: number) =>
    `${intl.formatNumber(v)} ${intl.formatMessage({ id: oCountID })}`;

  function renderSummary(total: number) {
    const avgUnit = intl.formatMessage({ id: `stats.history.per_${groupBy}` });
    const avg = rows.length > 0 ? total / rows.length : 0;
    return (
      <span className="history-summary">
        <FormattedMessage id="total" />:{" "}
        <strong>{intl.formatNumber(total)}</strong>
        <span className="history-summary-sep">·</span>
        {intl.formatNumber(avg, { maximumFractionDigits: 1 })} {avgUnit}
      </span>
    );
  }

  function renderControls() {
    return (
      <div className="activity-history-controls">
        <ButtonGroup size="sm">
          {presets.map((p) => (
            <Button
              key={p.id}
              variant={preset === p.id ? "primary" : "secondary"}
              onClick={() => setPreset(p.id)}
            >
              <FormattedMessage id={`stats.history.range.${p.id}`} />
            </Button>
          ))}
        </ButtonGroup>

        {preset === "custom" && (
          <div className="activity-history-custom-range">
            <DateInput
              value={customStart}
              onValueChange={setCustomStart}
              error={
                !range
                  ? intl.formatMessage({ id: "stats.history.invalid_range" })
                  : undefined
              }
            />
            <span>–</span>
            <DateInput value={customEnd} onValueChange={setCustomEnd} />
          </div>
        )}

        <div className="activity-history-controls-right">
          <ButtonGroup size="sm">
            {(["day", "week", "month"] as GroupBy[]).map((g) => (
              <Button
                key={g}
                variant={groupBy === g ? "primary" : "secondary"}
                onClick={() => setGroupBy(g)}
              >
                <FormattedMessage id={`stats.history.group.${g}`} />
              </Button>
            ))}
          </ButtonGroup>
          <Form.Check
            id="activity-history-show-table"
            type="switch"
            checked={showTable}
            onChange={() => setShowTable(!showTable)}
            label={intl.formatMessage({ id: "stats.history.show_table" })}
          />
        </div>
      </div>
    );
  }

  function renderTable() {
    const active = rows.filter((r) => r.plays > 0 || r.os > 0).reverse();
    if (active.length === 0) {
      return (
        <p className="text-muted">
          <FormattedMessage id="stats.history.no_activity" />
        </p>
      );
    }

    return (
      <div className="activity-history-table">
        <Table size="sm" striped>
          <thead>
            <tr>
              <th>
                <FormattedMessage id="date" />
              </th>
              <th className="text-right">
                <FormattedMessage id="play_count" />
              </th>
              <th className="text-right">
                <FormattedMessage id={oCountID} />
              </th>
            </tr>
          </thead>
          <tbody>
            {active.map((r) => (
              <tr key={r.key}>
                <td>{formatBucket(r.start, true)}</td>
                <td className="text-right">{intl.formatNumber(r.plays)}</td>
                <td className="text-right">{intl.formatNumber(r.os)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  function renderContent() {
    if (error) return <span>{error.message}</span>;
    if (!range) return;
    if (loading && !data) return <LoadingIndicator />;

    return (
      <>
        <div className="activity-history-chart">
          <div className="activity-history-chart-header">
            <h5>
              <FormattedMessage id="stats.history.play_history" />
            </h5>
            {renderSummary(totalPlays)}
          </div>
          <HistoryBarChart
            buckets={playBuckets}
            color={PLAY_COLOR}
            ariaLabel={intl.formatMessage({
              id: "stats.history.play_history",
            })}
            formatValue={formatPlays}
          />
        </div>
        <div className="activity-history-chart">
          <div className="activity-history-chart-header">
            <h5>
              <FormattedMessage id={oTitleID} />
            </h5>
            {renderSummary(totalOs)}
          </div>
          <HistoryBarChart
            buckets={oBuckets}
            color={O_COLOR}
            ariaLabel={intl.formatMessage({ id: oTitleID })}
            formatValue={formatOs}
          />
        </div>
        {showTable && renderTable()}
      </>
    );
  }

  return (
    <div className="activity-history col col-sm-8 m-sm-auto">
      {renderControls()}
      {renderContent()}
    </div>
  );
};
