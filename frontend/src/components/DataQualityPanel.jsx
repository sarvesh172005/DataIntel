import React, { useEffect, useState } from "react";
import {
  ShieldCheck, AlertTriangle, Sparkles, RefreshCw, Layers, Copy,
  CheckCircle2, ArrowRight, Zap, Info, Filter, BarChart3, Check, Download, FileSpreadsheet
} from "lucide-react";
import { getDatasetQuality, cleanDataset, exportDatasetCSV } from "../services/api";
import toast from "react-hot-toast";

export default function DataQualityPanel({ datasetId, token, onDatasetCleaned }) {
  const [quality, setQuality] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Cleaning options
  const [fixMissing, setFixMissing] = useState(true);
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [fixOutliers, setFixOutliers] = useState(true);
  const [outlierStrategy, setOutlierStrategy] = useState("cap"); // "cap" or "remove"
  const [lastCleanResult, setLastCleanResult] = useState(null);

  const fetchQuality = async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const res = await getDatasetQuality(datasetId, token);
      setQuality(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load dataset quality analysis");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuality();
  }, [datasetId, token]);

  const handleClean = async () => {
    if (!fixMissing && !removeDuplicates && !fixOutliers) {
      toast.error("Please select at least one cleaning option");
      return;
    }

    setCleaning(true);
    try {
      const res = await cleanDataset(
        datasetId,
        {
          fixMissing,
          removeDuplicates,
          fixOutliers,
          outlierStrategy
        },
        token
      );
      toast.success(res.data.message || "Dataset cleaned successfully!");
      setLastCleanResult(res.data.actionsTaken);
      // Re-fetch quality stats to show updated health score
      await fetchQuality();
      if (onDatasetCleaned) onDatasetCleaned();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || "Failed to clean dataset");
    } finally {
      setCleaning(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (!datasetId) return;
    setDownloading(true);
    try {
      const res = await exportDatasetCSV(datasetId, token);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      const baseName = quality?.name ? quality.name.replace(/\.[^/.]+$/, "") : "dataset";
      link.setAttribute("download", `${baseName}_cleaned.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Cleaned dataset downloaded successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to download cleaned dataset");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 space-y-4">
        <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin" />
        <p className="text-gray-400 text-sm font-semibold tracking-wide animate-pulse">
          Auditing dataset health, missing values, duplicates & outliers...
        </p>
      </div>
    );
  }

  if (!quality) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>No quality metrics available for this dataset.</p>
      </div>
    );
  }

  const { healthScore, healthStatus, missingValues, duplicates, outliers, columnAnalysis } = quality;

  // Score color badge
  const getScoreTheme = (score) => {
    if (score >= 90) return { stroke: "#10b981", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" };
    if (score >= 75) return { stroke: "#6366f1", bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" };
    if (score >= 50) return { stroke: "#f59e0b", bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" };
    return { stroke: "#ef4444", bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400" };
  };

  const theme = getScoreTheme(healthScore);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* ── Top Health Banner ── */}
      <div className={`p-6 md:p-8 rounded-[2rem] border ${theme.border} ${theme.bg} backdrop-blur-xl relative overflow-hidden shadow-2xl`}>
        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-48 h-48 bg-gradient-to-br from-indigo-500/20 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-6">
            {/* Circular Health Percentage Gauge */}
            <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="stroke-[#1e293b]"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke={theme.stroke}
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - healthScore / 100)}`}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white">{healthScore}%</span>
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Health</span>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-black text-white">Database Health Score</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${theme.border} ${theme.bg} ${theme.text}`}>
                  {healthStatus}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-1 max-w-xl">
                Computed by evaluating statistical outliers (IQR), missing cells, and duplicate records across {quality.totalRows.toLocaleString()} rows and {quality.totalColumns} dimensions.
              </p>
            </div>
          </div>

          <button
            onClick={fetchQuality}
            className="flex items-center gap-2 bg-[#1e293b] hover:bg-[#334155] border border-[#334155] text-gray-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-Scan Quality
          </button>
        </div>
      </div>

      {/* ── 3 Summary Metric Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Outliers Card */}
        <div className="p-6 rounded-[2rem] bg-[#0f172a]/70 border border-[#1e293b] hover:border-amber-500/30 transition-all duration-300 shadow-xl group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase font-black tracking-widest text-gray-400">Statistical Outliers</span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{outliers.total}</span>
            <span className="text-xs font-semibold text-amber-400">({outliers.percentage}%)</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Extreme points detected outside 1.5× Interquartile Range (IQR).
          </p>
        </div>

        {/* Missing Values Card */}
        <div className="p-6 rounded-[2rem] bg-[#0f172a]/70 border border-[#1e293b] hover:border-rose-500/30 transition-all duration-300 shadow-xl group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase font-black tracking-widest text-gray-400">Missing Values</span>
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-110 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{missingValues.totalMissingCells}</span>
            <span className="text-xs font-semibold text-rose-400">({missingValues.percentage}%)</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Empty, NULL or whitespace cells across all columns.
          </p>
        </div>

        {/* Duplicates Card */}
        <div className="p-6 rounded-[2rem] bg-[#0f172a]/70 border border-[#1e293b] hover:border-cyan-500/30 transition-all duration-300 shadow-xl group">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase font-black tracking-widest text-gray-400">Duplicate Rows</span>
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-110 transition-transform">
              <Copy className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{duplicates.count}</span>
            <span className="text-xs font-semibold text-cyan-400">({duplicates.percentage}%)</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Exact redundant row entries skewing queries & analytics.
          </p>
        </div>
      </div>

      {/* ── Automated Health Fix & Cleaning Action Card ── */}
      <div className="p-6 md:p-8 rounded-[2.5rem] bg-gradient-to-br from-[#1e293b]/90 to-[#0f172a] border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#334155]/60">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h4 className="text-xl font-black text-white">Automated Dataset Remediation & Cleaning</h4>
            </div>
            <p className="text-gray-400 text-xs md:text-sm mt-1">
              Select which issues to automatically repair. The engine will impute missing values, deduplicate records, and adjust outliers.
            </p>
          </div>

          <button
            onClick={handleClean}
            disabled={cleaning}
            className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white font-bold px-7 py-3 rounded-2xl shadow-lg shadow-indigo-500/25 transition-all duration-300 disabled:opacity-50 active:scale-95 shrink-0"
          >
            {cleaning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Remediating Dataset...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 fill-white" />
                <span>Fix & Clean Dataset Now</span>
              </>
            )}
          </button>
        </div>

        {/* Remediation Checkboxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <label className={`flex items-start gap-3 p-4 rounded-2xl border transition cursor-pointer select-none ${
            fixOutliers ? "bg-indigo-500/10 border-indigo-500/40" : "bg-[#0f172a]/60 border-[#334155]"
          }`}>
            <input
              type="checkbox"
              checked={fixOutliers}
              onChange={(e) => setFixOutliers(e.target.checked)}
              className="mt-1 accent-indigo-500 w-4 h-4 rounded cursor-pointer"
            />
            <div>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                Fix Outliers
                <span className="text-[10px] text-amber-400 font-normal">({outliers.total} found)</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Clamps anomalous numbers to upper/lower IQR bounds so distribution remains healthy.
              </p>
              {fixOutliers && (
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={outlierStrategy}
                    onChange={(e) => setOutlierStrategy(e.target.value)}
                    className="bg-[#0f172a] border border-[#334155] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="cap">Cap to IQR Bounds (Recommended)</option>
                    <option value="remove">Delete Outlier Rows</option>
                  </select>
                </div>
              )}
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-2xl border transition cursor-pointer select-none ${
            fixMissing ? "bg-indigo-500/10 border-indigo-500/40" : "bg-[#0f172a]/60 border-[#334155]"
          }`}>
            <input
              type="checkbox"
              checked={fixMissing}
              onChange={(e) => setFixMissing(e.target.checked)}
              className="mt-1 accent-indigo-500 w-4 h-4 rounded cursor-pointer"
            />
            <div>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                Fix Missing Values
                <span className="text-[10px] text-rose-400 font-normal">({missingValues.totalMissingCells} found)</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Imputes numeric gaps with column mean/median and categorical gaps with mode.
              </p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-2xl border transition cursor-pointer select-none ${
            removeDuplicates ? "bg-indigo-500/10 border-indigo-500/40" : "bg-[#0f172a]/60 border-[#334155]"
          }`}>
            <input
              type="checkbox"
              checked={removeDuplicates}
              onChange={(e) => setRemoveDuplicates(e.target.checked)}
              className="mt-1 accent-indigo-500 w-4 h-4 rounded cursor-pointer"
            />
            <div>
              <p className="text-sm font-bold text-white flex items-center gap-2">
                Remove Duplicate Rows
                <span className="text-[10px] text-cyan-400 font-normal">({duplicates.count} found)</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Deduplicates rows keeping the primary instance to avoid skewed query counts.
              </p>
            </div>
          </label>
        </div>

        {/* Last Clean Result Toast Alert */}
        {lastCleanResult && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <div>
              <span className="font-bold">Cleaning Complete: </span>
              {lastCleanResult.outliersCappedCount > 0 && `Capped ${lastCleanResult.outliersCappedCount} outliers. `}
              {lastCleanResult.outliersRowsRemoved > 0 && `Removed ${lastCleanResult.outliersRowsRemoved} outlier rows. `}
              {lastCleanResult.missingFixedCount > 0 && `Imputed ${lastCleanResult.missingFixedCount} missing cells. `}
              {lastCleanResult.duplicatesRemoved > 0 && `Purged ${lastCleanResult.duplicatesRemoved} duplicate rows. `}
              <span>Total rows now: {lastCleanResult.finalTotalRows}.</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Download Cleaned Dataset Export Card ── */}
      <div className="p-6 md:p-8 rounded-[2.5rem] bg-gradient-to-r from-emerald-950/40 via-[#0f172a] to-indigo-950/40 border border-emerald-500/30 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-5">
          <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shrink-0">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <h4 className="text-xl font-black text-white flex items-center gap-2">
              Export Cleaned Dataset
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                CSV Ready
              </span>
            </h4>
            <p className="text-gray-400 text-xs md:text-sm mt-1">
              Download the fully remediated dataset ({quality.totalRows.toLocaleString()} rows, {quality.totalColumns} columns) with imputations, deduplications & outlier caps applied.
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadCSV}
          disabled={downloading}
          className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold px-6 py-3.5 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all duration-300 disabled:opacity-50 active:scale-95 shrink-0 w-full sm:w-auto"
        >
          {downloading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Generating CSV...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download Cleaned CSV</span>
            </>
          )}
        </button>
      </div>

      {/* ── Per-Column Breakdown Table ── */}
      <div className="bg-[#0f172a]/80 backdrop-blur-xl rounded-[2.5rem] border border-[#1e293b] shadow-2xl overflow-hidden">
        <div className="p-6 md:p-8 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h4 className="text-lg font-bold text-white">Dimension-by-Dimension Quality Breakdown</h4>
          </div>
          <span className="text-xs text-gray-400">{columnAnalysis.length} Columns Analyzed</span>
        </div>

        <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[#0f172a] z-10 border-b border-[#1e293b]">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Column</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Type</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Missing</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Outliers (IQR)</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Bounds (Lower / Upper)</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]/50">
              {columnAnalysis.map((col, idx) => {
                const hasIssues = col.missingCount > 0 || (col.outlierInfo && col.outlierInfo.count > 0);
                return (
                  <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-bold text-white text-sm">
                      {col.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] text-gray-400 font-mono">
                        {col.dataType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {col.missingCount > 0 ? (
                        <span className="text-rose-400 font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                          {col.missingCount} ({col.missingPercentage}%)
                        </span>
                      ) : (
                        <span className="text-gray-500">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      {col.outlierInfo ? (
                        col.outlierInfo.count > 0 ? (
                          <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            {col.outlierInfo.count} ({col.outlierInfo.percentage}%)
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">0</span>
                        )
                      ) : (
                        <span className="text-gray-600 italic">Categorical</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-gray-400">
                      {col.outlierInfo ? (
                        <span>[{col.outlierInfo.lowerBound} … {col.outlierInfo.upperBound}]</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {hasIssues ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                          Needs Clean
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                          Clean
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
