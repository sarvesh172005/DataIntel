import React, { useEffect, useState, useRef } from 'react';
import { X, Database, Layers, LayoutGrid, FileText, Activity, Download, Loader2, PieChart as PieChartIcon, BarChart2, Lightbulb, TrendingUp, Sparkles, ShieldCheck } from 'lucide-react';
import { getDatasetSummary, getDatasetSuggestions } from '../services/api';
import DataQualityPanel from './DataQualityPanel';
import {
  XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, PieChart, Pie, Cell, CartesianGrid, Legend
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const COLORS = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#60a5fa', '#a78bfa', '#f87171'];

export default function DatasetReport({ datasetId, token, onClose, initialTab = "overview" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [data, setData] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [xAxisKey, setXAxisKey] = useState(null);
  const [yAxisKey, setYAxisKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef(null);

  const fetchSummary = () => {
    if (datasetId) {
      setLoading(true);
      getDatasetSummary(datasetId, token)
        .then(res => {
          setData(res.data);
          setLoading(false);
          
          if (res.data?.preview?.length > 0) {
            const keys = Object.keys(res.data.preview[0]);
            const nums = keys.filter(k => typeof res.data.preview[0][k] === 'number');
            const strs = keys.filter(k => typeof res.data.preview[0][k] === 'string');
            const cats = strs.filter(k => !k.toLowerCase().includes('id'));
            
            const preferredX = cats.find(k => ['contract', 'method', 'type', 'name'].some(p => k.toLowerCase().includes(p))) || cats[0] || strs[0];
            const preferredY = nums.find(k => ['charge', 'total', 'amount', 'score'].some(p => k.toLowerCase().includes(p))) || nums[0];
            const preferredCat = cats.find(k => ['gender', 'churn', 'contract', 'payment'].some(p => k.toLowerCase().includes(p))) || cats[0];

            setXAxisKey(preferredX);
            setYAxisKey(preferredY);
            setSelectedCategory(preferredCat);
          }
        })
        .catch(err => {
          console.log(err);
          setLoading(false);
        });

      // Fetch AI Suggestions
      setLoadingSuggestions(true);
      getDatasetSuggestions(datasetId, token)
        .then(res => {
          if (Array.isArray(res.data)) {
            setAiSuggestions(res.data);
          }
          setLoadingSuggestions(false);
        })
        .catch(err => {
          console.error("AI Suggestions error:", err);
          setLoadingSuggestions(false);
        });
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [datasetId, token]);

  const exportToPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: "#020617" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`Intelligence_Report_${data?.name || 'export'}.pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExporting(false);
    }
  };

  // Logic to build suggestions
  let suggestions = aiSuggestions.length > 0 ? aiSuggestions.map(s => ({
    ...s,
    icon: s.label.toLowerCase().includes('charge') || s.label.toLowerCase().includes('total') ? <TrendingUp className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />
  })) : [];
  
  let chartDataArea = [];
  let chartDataPie = [];
  let chartDataBar = [];
  let categoricalKeys = [];

  if (data?.preview?.length > 0) {
    const keys = Object.keys(data.preview[0]);
    categoricalKeys = keys.filter(k => typeof data.preview[0][k] === 'string' && !k.toLowerCase().includes('id'));

    // Manual fallback if AI fails
    if (suggestions.length === 0) {
        const nums = keys.filter(k => typeof data.preview[0][k] === 'number').slice(0, 2);
        const cats = categoricalKeys.slice(0, 3);
        nums.forEach(y => cats.forEach(x => {
            suggestions.push({ label: `${y} by ${x}`, x, y, icon: <Activity className="w-4 h-4" /> });
        }));
    }

    // Aggregation Logic for Area/Bar Charts
    if (xAxisKey && yAxisKey) {
      // Check if Y is numeric
      const isYNumeric = !isNaN(parseFloat(data.preview[0][yAxisKey])) && isFinite(data.preview[0][yAxisKey]);

      if (isYNumeric) {
        // Raw mapping for numeric Y
        chartDataArea = data.preview.map((row, i) => ({
          label: row[xAxisKey] ? String(row[xAxisKey]).substring(0, 10) : `Idx ${i}`,
          value: parseFloat(row[yAxisKey]) || 0
        }));
        // For Bar chart, let's take a sample or average if too many rows
        chartDataBar = data.preview.slice(0, 10).map(row => ({
          label: row[xAxisKey] ? String(row[xAxisKey]).substring(0, 12) : '?',
          amount: parseFloat(row[yAxisKey]) || 0
        }));
      } else {
        // Categorical Aggregation (Count occurrences of Y categories across X labels)
        const counts = {};
        data.preview.forEach(row => {
          const xVal = row[xAxisKey] ? String(row[xAxisKey]).substring(0, 10) : 'Other';
          const yVal = row[yAxisKey];
          if (!counts[xVal]) counts[xVal] = {};
          counts[xVal][yVal] = (counts[xVal][yVal] || 0) + 1;
        });

        // Focus on the most frequent Y category for the trend
        const yCategories = [...new Set(data.preview.map(r => r[yAxisKey]))];
        const primaryCat = yCategories[0];

        chartDataArea = Object.keys(counts).map(key => ({
          label: key,
          value: counts[key][primaryCat] || 0
        }));
        chartDataBar = chartDataArea.slice(0, 10).map(item => ({
          label: item.label,
          amount: item.value
        }));
      }
    }

    if (selectedCategory) {
      const pieCounts = {};
      data.preview.forEach(row => {
        const val = row[selectedCategory] ? String(row[selectedCategory]) : 'Unknown';
        pieCounts[val] = (pieCounts[val] || 0) + 1;
      });
      chartDataPie = Object.keys(pieCounts).map(k => ({ name: k, value: pieCounts[k] }));
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-[#020617] text-white overflow-hidden relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-[#1e293b]/50 bg-[#0f172a]/80 backdrop-blur-md z-10 w-full gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 ring-1 ring-indigo-500/20">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              {data?.name || "Dataset Intelligence"}
            </h2>
            <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <p className="text-xs text-gray-400 font-medium">Automatic Insight Generation Active</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-[#1e293b]/80 border border-[#334155] p-1 rounded-2xl self-start md:self-auto">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "overview"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Visual Analytics</span>
          </button>
          <button
            onClick={() => setActiveTab("quality")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "quality"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Database Health & Quality</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {data && activeTab === "overview" && (
            <button 
              onClick={exportToPDF}
              disabled={isExporting}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-2xl font-bold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 active:scale-95 text-xs"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export PDF
            </button>
          )}
          <button 
            onClick={onClose}
            className="p-2.5 text-gray-400 bg-white/5 hover:text-white hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/50 rounded-2xl transition-all"
            title="Close Report"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
        <div ref={reportRef} className="p-6 md:p-10 space-y-10 max-w-7xl mx-auto pb-24">
          {activeTab === "quality" ? (
            <DataQualityPanel 
              datasetId={datasetId} 
              token={token} 
              onDatasetCleaned={() => {
                fetchSummary();
              }}
            />
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-6">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"></div>
              </div>
              <p className="font-bold text-xl text-indigo-300 animate-pulse tracking-wide">Synthesizing Dataset Relations...</p>
            </div>
          ) : data ? (
            <>
              {/* Perspective Suggestions - REPLACES DROPDOWN */}
              <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Lightbulb className="w-5 h-5 text-amber-400 fill-amber-400/20" />
                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em]">Select Analysis Perspective</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {loadingSuggestions ? (
                      [1,2,3].map(i => (
                        <div key={i} className="h-24 bg-white/5 animate-pulse rounded-[2rem] border border-white/5 flex items-center p-5 gap-4">
                          <div className="w-10 h-10 bg-white/10 rounded-2xl"></div>
                          <div className="space-y-2">
                             <div className="h-3 w-32 bg-white/10 rounded"></div>
                             <div className="h-2 w-20 bg-white/5 rounded"></div>
                          </div>
                        </div>
                      ))
                    ) : suggestions.map((suggestion, idx) => {
                      const isActive = xAxisKey === suggestion.x && yAxisKey === suggestion.y;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setXAxisKey(suggestion.x);
                            setYAxisKey(suggestion.y);
                          }}
                          className={`flex items-start gap-4 p-5 rounded-[2rem] border transition-all duration-300 group relative overflow-hidden ${
                            isActive 
                            ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/30' 
                            : 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className={`p-3 rounded-2xl transition-colors ${isActive ? 'bg-indigo-500 text-white' : 'bg-white/5 text-gray-400 group-hover:text-white'}`}>
                            {suggestion.icon}
                          </div>
                          <div className="text-left">
                            <p className={`text-sm font-bold transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                              {suggestion.label}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1 font-medium italic">Correlation View</p>
                          </div>
                          {isActive && (
                            <div className="absolute top-3 right-3">
                              <div className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
              </div>

              {/* Data Visualization Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 pt-4">
                {/* Area Chart */}
                {chartDataArea.length > 0 && (
                  <div className="bg-[#0f172a]/60 rounded-[2.5rem] border border-[#1e293b] p-8 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <TrendingUp className="w-32 h-32 text-indigo-500" />
                    </div>
                    <header className="mb-10 relative">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            Trend Intensity
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 font-medium">
                          {isNaN(parseFloat(data.preview[0][yAxisKey])) 
                            ? `Frequency Distribution of ${yAxisKey} across ${xAxisKey}` 
                            : `Tracking ${yAxisKey} metrics mapped to ${xAxisKey}`}
                        </p>
                    </header>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartDataArea}>
                          <defs>
                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.5} />
                          <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                          <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} width={45} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1.25rem', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                            itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '6px', fontSize: '11px', fontWeight: 'bold' }}
                          />
                          <Area type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={5} fillOpacity={1} fill="url(#colorVal)" animationDuration={1500} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Bar Chart */}
                {chartDataBar.length > 0 && (
                  <div className="bg-[#0f172a]/60 rounded-[2.5rem] border border-[#1e293b] p-8 shadow-2xl group">
                    <header className="mb-10">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            Direct Comparison
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 font-medium">
                          {isNaN(parseFloat(data.preview[0][yAxisKey]))
                            ? `Occurrence Audit of ${yAxisKey}`
                            : `Comparative audit of ${yAxisKey}`}
                        </p>
                    </header>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartDataBar}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} strokeOpacity={0.5} />
                          <XAxis dataKey="label" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                          <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={45} />
                          <RechartsTooltip 
                            cursor={{fill: 'rgba(255,255,255,0.03)'}} 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1.25rem', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
                            labelStyle={{ color: '#94a3b8', marginBottom: '6px', fontSize: '11px', fontWeight: 'bold' }}
                          />
                          <Bar dataKey="amount" fill="#10b981" radius={[10, 10, 0, 0]} barSize={28} animationDuration={1500} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Distribution Overview */}
                <div className="bg-[#0f172a]/60 rounded-[2.5rem] border border-[#1e293b] p-8 shadow-2xl xl:col-span-2">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 mb-12">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            Distribution Analysis
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 font-medium">Percentage share overview for <span className="text-indigo-400 font-bold uppercase tracking-wider">{selectedCategory}</span></p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 p-1.5 bg-white/5 rounded-[1.5rem] border border-white/5">
                        {categoricalKeys.slice(0, 5).map(k => (
                          <button
                            key={k}
                            onClick={() => setSelectedCategory(k)}
                            className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${
                              selectedCategory === k 
                              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                    {chartDataPie.length > 0 && (
                        <div className="h-80 w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                <Pie
                                    data={chartDataPie}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={10}
                                    dataKey="value"
                                    stroke="none"
                                    animationDuration={1500}
                                    label={({name, percent}) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                >
                                    {chartDataPie.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1.25rem', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} 
                                />
                                <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
              </div>

              {/* Stats & Schema Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1 space-y-6">
                      <div className="p-8 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 shadow-xl flex items-center gap-8 group hover:bg-indigo-500/20 transition-all duration-500">
                        <div className="p-5 bg-indigo-500 text-white rounded-3xl shadow-[0_10px_20px_rgba(99,102,241,0.3)]">
                            <Layers className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-4xl font-black text-white">{data.rowCount?.toLocaleString() || 0}</h3>
                            <p className="text-xs text-indigo-400 font-black uppercase tracking-widest mt-2">Captured Rows</p>
                        </div>
                      </div>

                      <div className="p-8 rounded-[2rem] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 shadow-xl flex items-center gap-8 group hover:bg-emerald-500/20 transition-all duration-500">
                        <div className="p-5 bg-emerald-500 text-white rounded-3xl shadow-[0_10px_20px_rgba(16,185,129,0.3)]">
                            <LayoutGrid className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-4xl font-black text-white">{data.columns?.length || 0}</h3>
                            <p className="text-xs text-emerald-400 font-black uppercase tracking-widest mt-2">Data Columns</p>
                        </div>
                      </div>
                  </div>

                  <div className="lg:col-span-2 bg-[#0f172a]/80 backdrop-blur-xl rounded-[2.5rem] border border-[#1e293b] shadow-2xl overflow-hidden self-start">
                    <div className="p-8 border-b border-[#1e293b] flex items-center gap-4 bg-white/5">
                        <FileText className="w-6 h-6 text-indigo-400" />
                        <h3 className="text-xl font-bold text-white">Structural Overview</h3>
                    </div>
                    <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-[#0f172a] z-10 border-b border-[#1e293b]">
                                <tr>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Dimension</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Type</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Example</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1e293b]/50">
                                {data.columns?.map((col, idx) => (
                                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-8 py-5 font-bold text-indigo-300/80 group-hover:text-indigo-300 text-sm transition-colors">{col.column_name}</td>
                                        <td className="px-8 py-5">
                                            <span className="px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[9px] text-gray-400 font-black uppercase tracking-tighter">
                                                {col.data_type}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-gray-500 max-w-xs truncate italic text-xs">
                                            {col.sample_values || 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                  </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-40">
              <div className="w-24 h-24 rounded-full bg-indigo-500/5 flex items-center justify-center relative mb-8">
                <Sparkles className="w-12 h-12 text-indigo-500 animate-pulse" />
                <div className="absolute inset-0 border-2 border-indigo-500/20 border-dashed rounded-full animate-[spin_10s_linear_infinite]"></div>
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Intelligence Ready</h3>
              <p className="text-gray-500 mt-2 font-medium">Please select a dataset to begin the analysis</p>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
}
