import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import GadgetWrapper from './GadgetWrapper';
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';

const BurndownGadget = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState({ boardId: null, teamSize: 10 });
  const [selectedMember, setSelectedMember] = useState('All');
  const [showDebug, setShowDebug] = useState(false);

  // Load configuration
  const loadConfig = useCallback(async () => {
    try {
      const savedConfig = await invoke('getConfig');
      if (savedConfig?.boardId) {
        setConfig(savedConfig);
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
  }, []);

  // Load burndown data
  const loadData = useCallback(async () => {
    if (!config.boardId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await invoke('getBurndownData', {
        boardId: config.boardId,
        assignee: selectedMember,
        teamSize: config.teamSize
      });

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [config.boardId, config.teamSize, selectedMember]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (config.boardId) {
      loadData();
    }
  }, [config.boardId, selectedMember, loadData]);

  // Format sprint date for display
  const formatSprintDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'white',
          border: '1px solid #dfe1e6',
          borderRadius: '3px',
          padding: '12px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
          <p style={{ fontWeight: '600', marginBottom: '8px', color: '#172B4D' }}>{label}</p>
          {payload.map((entry, index) => {
            // Skip if value is null or 0
            if (entry.value == null || entry.value === 0) return null;

            // For remaining, show the color based on whether it's the red portion
            let displayColor = entry.color;
            let displayName = entry.name;
            if (entry.dataKey === 'remainingNegative') {
              displayColor = '#DE350B';
              displayName = 'Remaining (Over Capacity)';
            }

            return (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '4px'
              }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  backgroundColor: displayColor,
                  borderRadius: '2px'
                }} />
                <span style={{ fontSize: '12px', color: '#42526E' }}>
                  {displayName}: {Math.abs(entry.value).toFixed(1)}h
                  {entry.value < 0 ? ' (removed)' : ''}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Custom Legend
  const renderLegend = (props) => {
    const { payload } = props;
    // Filter out remainingNegative from legend (it's shown as part of Remaining)
    const filteredPayload = payload.filter(entry => entry.dataKey !== 'remainingNegative');
    return (
      <div className="legend" style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        marginTop: '16px',
        flexWrap: 'wrap'
      }}>
        {filteredPayload.map((entry, index) => (
          <div key={`legend-${index}`} className="legend-item" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {entry.type === 'line' ? (
              <div className="legend-line" style={{
                width: '20px',
                height: '3px',
                background: entry.color
              }}></div>
            ) : (
              <div className="legend-color" style={{
                width: '12px',
                height: '12px',
                background: entry.color,
                borderRadius: '2px'
              }}></div>
            )}
            <span style={{ fontSize: '12px', color: '#42526E' }}>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // Not configured - wrapped in GadgetWrapper which handles this
  if (!config.boardId && !loading) {
    return (
      <GadgetWrapper
        gadgetTitle="Sprint Burndown Chart"
        gadgetSubtitle=""
        onConfigChange={loadConfig}
      >
        <div className="gadget" />
      </GadgetWrapper>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ marginTop: '12px' }}>Loading burndown data...</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="error">
        <p>⚠️ {error}</p>
        <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={loadData}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const {
    dataPoints,
    sprintName,
    sprintStartDate,
    sprintEndDate,
    maxCapacity,
    totalOriginalEstimate,
    currentRemaining,
    totalSpent,
    scopeAddedTotal,
    scopeRemovedTotal,
    workingDays,
    teamSize,
    assignees,
    addedIssuesCount,
    removedIssuesCount
  } = data;

  // Calculate daily decrease for debug display
  const dailyDecrease = workingDays > 1
    ? totalOriginalEstimate / (workingDays - 1)
    : totalOriginalEstimate;

  return (
    <GadgetWrapper
      gadgetTitle="Sprint Burndown Chart"
      gadgetSubtitle={sprintName}
      onConfigChange={loadConfig}
    >
      <div className="gadget">
      {/* Header */}
      <div className="gadget-header">
        <div>
          <div className="gadget-title">Sprint Burndown Chart</div>
          <div className="gadget-subtitle">{sprintName}</div>
        </div>
        <select
          className="select"
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
        >
          <option value="All">All Team ({assignees?.length || 0})</option>
          {assignees?.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {/* Metrics Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '12px',
        padding: '12px 0',
        borderBottom: '1px solid #DFE1E6'
      }}>
        <div className="metric-card">
          <div className="metric-label">Max Capacity</div>
          <div className="metric-value" style={{ color: '#00B8D9' }}>
            {maxCapacity != null ? `${maxCapacity}h` : '0h'}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Original Estimate</div>
          <div className="metric-value" style={{ color: '#172B4D' }}>
            {totalOriginalEstimate != null ? `${totalOriginalEstimate}h` : '0h'}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Remaining</div>
          <div className="metric-value" style={{ color: '#0065FF' }}>
            {currentRemaining != null ? `${currentRemaining}h` : '0h'}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Time Logged</div>
          <div className="metric-value" style={{ color: '#00B8D9' }}>
            {totalSpent != null ? `${totalSpent}h` : '0h'}
          </div>
        </div>

        {(scopeAddedTotal > 0 || scopeRemovedTotal > 0) && (
          <div className="metric-card">
            <div className="metric-label">Scope Changes</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {scopeAddedTotal > 0 && (
                <span className="metric-value" style={{ color: '#FF991F', fontSize: '14px' }}>
                  +{scopeAddedTotal}h ({addedIssuesCount})
                </span>
              )}
              {scopeRemovedTotal > 0 && (
                <span className="metric-value" style={{ color: '#DE350B', fontSize: '14px' }}>
                  -{scopeRemovedTotal}h ({removedIssuesCount})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sprint Info - Show start/end dates from sprint */}
      <div className="capacity-info" style={{ marginTop: '12px' }}>
        <span style={{ fontWeight: '600', color: '#344563' }}>Sprint Duration</span>
        <div className="capacity-line"></div>
        <span className="capacity-value">
          {formatSprintDate(sprintStartDate)} — {formatSprintDate(sprintEndDate)}
        </span>
        <span className="capacity-formula">
          ({workingDays} working days{selectedMember === 'All' ? `, ${teamSize} members` : ''})
        </span>
      </div>

      {/* Max Capacity Info */}
      <div className="capacity-info" style={{ marginTop: '4px' }}>
        <span style={{ fontWeight: '600', color: '#344563' }}>Max Capacity</span>
        <div className="capacity-line"></div>
        <span className="capacity-value">{maxCapacity}h</span>
        <span className="capacity-formula">
          ({workingDays} days × 8h × {teamSize}{selectedMember !== 'All' ? ' person' : ' members'})
        </span>
      </div>

      {/* Chart */}
      <div className="chart-container" style={{ height: '350px', marginTop: '20px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={dataPoints}
            margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
            stackOffset="sign"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f5f7" />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 11, fill: '#6b778c' }}
              axisLine={{ stroke: '#dfe1e6' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b778c' }}
              axisLine={{ stroke: '#dfe1e6' }}
              label={{
                value: 'Hours',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 12, fill: '#6b778c' }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />

            {/* Zero line - Important for negative bars */}
            <ReferenceLine
              y={0}
              stroke="#42526E"
              strokeWidth={1.5}
              label={{
                value: 'Baseline',
                position: 'left',
                style: { fontSize: 10, fill: '#6b778c' }
              }}
            />

            {/* Scope Removed (Negative Bar - Below Baseline, Red) */}
            <Bar
              dataKey="removed"
              fill="#DE350B"
              name="Scope Removed"
              radius={[0, 0, 2, 2]}
              stackId="burndown"
            />

            {/* Remaining Estimate (Main Bar) - Blue above baseline */}
            <Bar
              dataKey="remaining"
              name="Remaining"
              fill="#0065FF"
              radius={[0, 0, 0, 0]}
              stackId="burndown"
            />

            {/* Scope Added (Stacked on Top of Remaining, Orange) */}
            <Bar
              dataKey="added"
              fill="#FF991F"
              name="Scope Added"
              radius={[2, 2, 0, 0]}
              stackId="burndown"
            />

            {/* Ideal Burndown Line (Based on Original Estimate, linear to 0) */}
            <Line
              type="linear"
              dataKey="ideal"
              stroke="#36B37E"
              strokeWidth={3}
              dot={false}
              name="Ideal Burndown"
              connectNulls={true}
            />

            {/* Time Logged Line (Cumulative, dashed) */}
            <Line
              type="monotone"
              dataKey="timeLogged"
              stroke="#00B8D9"
              strokeWidth={2}
              dot={{ fill: '#00B8D9', r: 3 }}
              strokeDasharray="5 5"
              name="Time Logged"
              connectNulls={true}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Info Box - Scope Changes */}
      {(addedIssuesCount > 0 || removedIssuesCount > 0) && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: '#FFF7E6',
          border: '1px solid #FFE7BA',
          borderRadius: '3px',
          fontSize: '12px',
          color: '#172B4D'
        }}>
          <strong>Scope Changes Detected:</strong>
          <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
            {addedIssuesCount > 0 && (
              <li>
                <span style={{ color: '#FF991F', fontWeight: '600' }}>
                  +{addedIssuesCount} issue{addedIssuesCount > 1 ? 's' : ''}
                </span> added to sprint
                ({scopeAddedTotal}h)
              </li>
            )}
            {removedIssuesCount > 0 && (
              <li>
                <span style={{ color: '#DE350B', fontWeight: '600' }}>
                  -{removedIssuesCount} issue{removedIssuesCount > 1 ? 's' : ''}
                </span> removed from sprint
                ({scopeRemovedTotal}h)
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Help Text */}
      <div style={{
        marginTop: '12px',
        padding: '8px',
        fontSize: '11px',
        color: '#6B778C',
        borderTop: '1px solid #DFE1E6'
      }}>
        <strong>Legend:</strong>
        <span style={{ color: '#36B37E', marginLeft: '8px' }}>●</span> Ideal = Linear burndown from Original Estimate ({totalOriginalEstimate}h)
        <span style={{ color: '#0065FF', marginLeft: '12px' }}>■</span> Remaining = Per-day remaining (OE - logged + added - removed)
        <span style={{ color: '#FF991F', marginLeft: '12px' }}>■</span> Added = Tasks added after sprint start
        <span style={{ color: '#DE350B', marginLeft: '12px' }}>■</span> Removed = Tasks removed from sprint (below baseline)
      </div>

      {/* Debug Panel */}
      <div style={{ marginTop: '12px', borderTop: '2px solid #FF991F' }}>
        <button
          onClick={() => setShowDebug(!showDebug)}
          style={{
            background: '#FFF7E6',
            border: '1px solid #FFE7BA',
            borderRadius: '3px',
            padding: '4px 12px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: '600',
            color: '#172B4D',
            marginTop: '8px'
          }}
        >
          {showDebug ? '▼ Hide Debug' : '► Show Debug'}
        </button>

        {showDebug && (
          <div style={{
            marginTop: '8px',
            padding: '12px',
            background: '#F4F5F7',
            border: '1px solid #DFE1E6',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            maxHeight: '400px',
            overflow: 'auto'
          }}>
            <div style={{ fontWeight: '700', marginBottom: '8px', color: '#DE350B' }}>🔍 DEBUG DATA</div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Capacity ──</div>
            <div>workingDays = {workingDays}</div>
            <div>teamSize = {teamSize}</div>
            <div>maxCapacity = {workingDays} × 8 × {teamSize} = <b>{maxCapacity}h</b></div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Ideal Line ──</div>
            <div>startValue = totalOriginalEstimate = <b>{totalOriginalEstimate}h</b></div>
            <div>dailyDecrease = {totalOriginalEstimate} / ({workingDays} - 1) = <b>{dailyDecrease.toFixed(2)}h/day</b></div>
            <div>endValue = 0h (at last working day)</div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Estimates ──</div>
            <div>totalOriginalEstimate (tasks only) = <b>{totalOriginalEstimate}h</b></div>
            <div>currentRemaining (Jira field) = <b>{currentRemaining}h</b></div>
            <div>totalSpent (Jira field) = <b>{totalSpent}h</b></div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Remaining Calculation ──</div>
            <div>Formula: Remain(day0) = totalOriginalEstimate = {totalOriginalEstimate}h</div>
            <div>Formula: Remain(dayN) = Remain(dayN-1) - Logged(dayN) + Added(dayN) - Removed(dayN)</div>
            <div>Source: Worklogs fetched via /rest/api/3/issue/KEY/worklog API</div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Scope Changes ──</div>
            <div>scopeAdded = +{scopeAddedTotal}h ({addedIssuesCount} tasks)</div>
            <div>scopeRemoved = -{scopeRemovedTotal}h ({removedIssuesCount} tasks)</div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Member Filter ──</div>
            <div>selectedMember = "{selectedMember}"</div>
            <div>assignees = [{assignees?.join(', ')}]</div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Sprint ──</div>
            <div>sprintName = {sprintName}</div>
            <div>startDate = {sprintStartDate}</div>
            <div>endDate = {sprintEndDate}</div>

            <div style={{ fontWeight: '600', color: '#0065FF', marginTop: '8px' }}>── Data Points ({dataPoints?.length}) ──</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginTop: '4px' }}>
              <thead>
                <tr style={{ background: '#DFE1E6' }}>
                  <th style={{ padding: '2px 4px', textAlign: 'left', border: '1px solid #C1C7D0' }}>Date</th>
                  <th style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>Ideal</th>
                  <th style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>Remain</th>
                  <th style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>DayLog</th>
                  <th style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>CumLog</th>
                  <th style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>Added</th>
                  <th style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>Removed</th>
                </tr>
              </thead>
              <tbody>
                {dataPoints?.map((dp, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F4F5F7' }}>
                    <td style={{ padding: '2px 4px', border: '1px solid #C1C7D0' }}>{dp.date}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0' }}>{dp.ideal}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0', color: '#0065FF' }}>{dp.remaining ?? '-'}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0', color: '#00B8D9' }}>{dp.dayLogged ?? '-'}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0', color: '#00B8D9' }}>{dp.timeLogged ?? '-'}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0', color: '#FF991F' }}>{dp.added || '-'}</td>
                    <td style={{ padding: '2px 4px', textAlign: 'right', border: '1px solid #C1C7D0', color: '#DE350B' }}>{dp.removed || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </GadgetWrapper>
  );
};

export default BurndownGadget;
