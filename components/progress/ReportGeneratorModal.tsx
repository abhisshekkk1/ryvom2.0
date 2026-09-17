"use client";

import React, { useState } from "react";
import { FileText, Download, Check, X, Printer, Archive, Copy } from "lucide-react";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { Client, CheckIn, CoachReview, PerformanceWithLogs, CoachTimelineNote } from "@/lib/types";
import { computeMetricSummary, formatNum, formatDiff } from "@/lib/progressAnalytics";

interface ReportGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  checkIns: CheckIn[];
  reviews: Record<string, CoachReview>;
  performanceMetrics: PerformanceWithLogs[];
  coachNotes: CoachTimelineNote[];
  dateRangeLabel: string;
}

export default function ReportGeneratorModal({
  isOpen,
  onClose,
  client,
  checkIns,
  reviews,
  performanceMetrics,
  coachNotes,
  dateRangeLabel,
}: ReportGeneratorModalProps) {
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includePerformance, setIncludePerformance] = useState(true);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [includeCoachNotes, setIncludeCoachNotes] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);

  if (!isOpen) return null;

  const weightSummary = computeMetricSummary(checkIns, "weight");
  const waistSummary = computeMetricSummary(checkIns, "waist_cm");
  const dietSummary = computeMetricSummary(checkIns, "diet_adherence");
  const trainingSummary = computeMetricSummary(checkIns, "training_adherence");
  const stepsSummary = computeMetricSummary(checkIns, "average_steps");
  const sleepSummary = computeMetricSummary(checkIns, "sleep_hours");

  // Generate plain text snapshot for instant copying
  const generateSnapshotText = () => {
    let text = `==============================\n`;
    text += `RYVOM CLIENT PROGRESS SNAPSHOT\n`;
    text += `Client: ${client.full_name}\n`;
    text += `Period: ${dateRangeLabel}\n`;
    text += `==============================\n\n`;

    if (weightSummary.count > 0) {
      text += `WEIGHT:\n`;
      text += `  ${formatNum(weightSummary.first, 1)} kg -> ${formatNum(weightSummary.latest, 1)} kg (${formatDiff(weightSummary.absoluteChange, 1, "kg")})\n\n`;
    }

    if (waistSummary.count > 0) {
      text += `WAIST:\n`;
      text += `  ${formatNum(waistSummary.first, 1)} cm -> ${formatNum(waistSummary.latest, 1)} cm (${formatDiff(waistSummary.absoluteChange, 1, "cm")})\n\n`;
    }

    text += `CONSISTENCY:\n`;
    text += `  Diet Adherence:     ${formatNum(dietSummary.average, 0, "", "%")}\n`;
    text += `  Training Adherence: ${formatNum(trainingSummary.average, 0, "", "%")}\n`;
    text += `  Average Steps:      ${formatNum(stepsSummary.average, 0)}\n`;
    text += `  Average Sleep:      ${formatNum(sleepSummary.average, 1, "", " h")}\n\n`;

    if (performanceMetrics.length > 0) {
      text += `KEY PERFORMANCE:\n`;
      performanceMetrics.forEach((m) => {
        text += `  ${m.name}: ${formatNum(m.starting_value, 1)} -> ${formatNum(m.current_value, 1)} ${m.unit} (PR: ${formatNum(m.best_value, 1)} ${m.unit})\n`;
      });
      text += `\n`;
    }

    text += `Generated on ${new Date().toLocaleDateString("en-GB")}\n`;
    return text;
  };

  const handleCopySnapshot = () => {
    navigator.clipboard.writeText(generateSnapshotText());
    setCopiedSnapshot(true);
    setTimeout(() => setCopiedSnapshot(false), 2000);
  };

  // CSV Export for the filtered check-ins
  const handleExportCSV = () => {
    const metricHeaders = performanceMetrics.map((m) => `"${m.name} (${m.unit})"`);
    const headers = [
      "Week Ending",
      "Submitted At",
      "Weight (kg)",
      "Average Weight (kg)",
      "Waist (cm)",
      "Diet Adherence (%)",
      "Training Adherence (%)",
      "Average Steps",
      "Sleep (hours)",
      "Hunger (1-10)",
      "Energy (1-10)",
      "Stress (1-10)",
      "Status",
      ...metricHeaders,
      "Client Notes",
      "Coach Wins",
      "Coach Adjustments",
      "Coach Next Week Goals",
    ];

    const rows = checkIns.map((c) => {
      const review = reviews[c.id];
      const metricValues = performanceMetrics.map((m) => {
        const log = m.logs.find(
          (l) => l.check_in_id === c.id || l.logged_date === c.week_ending
        );
        return log ? log.value : "";
      });

      return [
        `"${c.week_ending}"`,
        `"${c.submitted_at || ""}"`,
        c.weight ?? "",
        c.average_weight ?? "",
        c.waist_cm ?? "",
        c.diet_adherence ?? "",
        c.training_adherence ?? "",
        c.average_steps ?? "",
        c.sleep_hours ?? "",
        c.hunger ?? "",
        c.energy ?? "",
        c.stress ?? "",
        `"${c.status}"`,
        ...metricValues,
        `"${(c.client_notes || "").replace(/"/g, '""')}"`,
        `"${(review?.wins || "").replace(/"/g, '""')}"`,
        `"${(review?.adjustments || "").replace(/"/g, '""')}"`,
        `"${(review?.next_week_goals || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RYVOM_${client.full_name.replace(/\s+/g, "_")}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // PDF Report Generation using jsPDF
  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      // ─── Header / Cover Banner ───
      doc.setFillColor(18, 18, 20); // Dark theme header
      doc.rect(0, 0, pageWidth, 42, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(245, 158, 11); // Amber accent
      doc.text("RYVOM", 16, 18);

      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text("CLIENT PROGRESS & PERFORMANCE REPORT", 16, 26);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(161, 161, 170);
      doc.text(`Client: ${client.full_name}   |   Period: ${dateRangeLabel}   |   Date: ${new Date().toLocaleDateString("en-GB")}`, 16, 34);

      y = 52;

      // ─── Progress Summary Box ───
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(24, 24, 27);
      doc.text("1. EXECUTIVE PROGRESS SUMMARY", 16, y);
      y += 6;

      doc.setFillColor(244, 244, 245);
      doc.rect(16, y, pageWidth - 32, 38, "F");
      doc.rect(16, y, pageWidth - 32, 38, "S");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(63, 63, 70);

      const col1 = 22;
      const col2 = 75;
      const col3 = 135;

      doc.text("BODY METRICS", col1, y + 8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 24, 27);
      doc.text(`Weight: ${formatNum(weightSummary.first, 1)} -> ${formatNum(weightSummary.latest, 1)} kg (${formatDiff(weightSummary.absoluteChange, 1, "kg")})`, col1, y + 16);
      doc.text(`Waist: ${formatNum(waistSummary.first, 1)} -> ${formatNum(waistSummary.latest, 1)} cm (${formatDiff(waistSummary.absoluteChange, 1, "cm")})`, col1, y + 24);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(63, 63, 70);
      doc.text("CONSISTENCY AVERAGES", col2, y + 8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 24, 27);
      doc.text(`Diet Adherence: ${formatNum(dietSummary.average, 0, "", "%")}`, col2, y + 16);
      doc.text(`Training Adherence: ${formatNum(trainingSummary.average, 0, "", "%")}`, col2, y + 24);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(63, 63, 70);
      doc.text("ACTIVITY & RECOVERY", col3, y + 8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 24, 27);
      doc.text(`Average Steps: ${formatNum(stepsSummary.average, 0)}`, col3, y + 16);
      doc.text(`Average Sleep: ${formatNum(sleepSummary.average, 1, "", " h")}`, col3, y + 24);

      y += 48;

      // ─── Performance PRs ───
      if (includePerformance && performanceMetrics.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(24, 24, 27);
        doc.text("2. PHYSICAL PERFORMANCE BENCHMARKS & PRS", 16, y);
        y += 8;

        doc.setFontSize(9);
        performanceMetrics.forEach((m) => {
          doc.setFont("helvetica", "bold");
          doc.text(`• ${m.name}:`, 18, y);
          doc.setFont("helvetica", "normal");
          doc.text(`Starting: ${formatNum(m.starting_value, 1)} ${m.unit}   |   Current: ${formatNum(m.current_value, 1)} ${m.unit}   |   PR / Best: ${formatNum(m.best_value, 1)} ${m.unit} (${formatDiff(m.absolute_change, 1, m.unit)})`, 55, y);
          y += 6;
        });
        y += 6;
      }

      // ─── Check-in History Table ───
      if (includeHistory && checkIns.length > 0) {
        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(24, 24, 27);
        doc.text("3. CHECK-IN TIMELINE HISTORY", 16, y);
        y += 8;

        // Table Header
        doc.setFillColor(228, 228, 231);
        doc.rect(16, y, pageWidth - 32, 7, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(24, 24, 27);
        doc.text("Date", 18, y + 5);
        doc.text("Weight", 42, y + 5);
        doc.text("Waist", 62, y + 5);
        doc.text("Diet", 80, y + 5);
        doc.text("Training", 100, y + 5);
        doc.text("Steps", 125, y + 5);
        doc.text("Sleep", 145, y + 5);
        doc.text("Status", 165, y + 5);
        y += 7;

        doc.setFont("helvetica", "normal");
        checkIns.slice(0, 15).forEach((c, idx) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          if (idx % 2 === 1) {
            doc.setFillColor(250, 250, 250);
            doc.rect(16, y, pageWidth - 32, 6, "F");
          }
          doc.text(c.week_ending, 18, y + 4.5);
          doc.text(c.weight ? `${c.weight} kg` : "-", 42, y + 4.5);
          doc.text(c.waist_cm ? `${c.waist_cm} cm` : "-", 62, y + 4.5);
          doc.text(c.diet_adherence ? `${c.diet_adherence}%` : "-", 80, y + 4.5);
          doc.text(c.training_adherence ? `${c.training_adherence}%` : "-", 100, y + 4.5);
          doc.text(c.average_steps ? `${c.average_steps}` : "-", 125, y + 4.5);
          doc.text(c.sleep_hours ? `${c.sleep_hours}h` : "-", 145, y + 4.5);
          doc.text(c.status, 165, y + 4.5);
          y += 6;
        });

        y += 6;
      }

      // ─── Coach Feedback / Notes ───
      if (includeFeedback) {
        if (y > 230) {
          doc.addPage();
          y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(24, 24, 27);
        doc.text("4. COACH REVIEWS & PROGRAM ADJUSTMENTS", 16, y);
        y += 8;

        const reviewedCheckIns = checkIns.filter((c) => reviews[c.id]);
        if (reviewedCheckIns.length === 0) {
          doc.setFontSize(9);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(113, 113, 122);
          doc.text("No formal coach reviews logged in this date range.", 18, y);
          y += 8;
        } else {
          reviewedCheckIns.slice(0, 3).forEach((c) => {
            const r = reviews[c.id];
            if (y > 250) {
              doc.addPage();
              y = 20;
            }
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(24, 24, 27);
            doc.text(`Check-in: ${c.week_ending}`, 18, y);
            y += 5;

            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(63, 63, 70);
            if (r.wins) {
              doc.text(`Wins: ${r.wins}`, 22, y);
              y += 4.5;
            }
            if (r.adjustments) {
              doc.text(`Adjustments: ${r.adjustments}`, 22, y);
              y += 4.5;
            }
            if (r.next_week_goals) {
              doc.text(`Goals: ${r.next_week_goals}`, 22, y);
              y += 4.5;
            }
            y += 3;
          });
        }
      }

      // ─── Coach Notes Section ───
      if (includeCoachNotes && coachNotes && coachNotes.length > 0) {
        if (y > 230) {
          doc.addPage();
          y = 25;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(24, 24, 27);
        doc.text("COACH NOTES & OBSERVATIONS (CONFIDENTIAL)", 16, y);
        y += 7;

        coachNotes.slice(0, 10).forEach((n) => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(24, 24, 27);
          doc.text(`[${n.note_date}] (${n.category || "General"}):`, 18, y);
          y += 4.5;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(63, 63, 70);
          const split = doc.splitTextToSize(n.note, 165);
          doc.text(split, 22, y);
          y += split.length * 4.5 + 3;
        });
      }

      // ─── Footer ───
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(161, 161, 170);
        doc.text(`RYVOM Digital PT Check-In & Progress Platform   |   Page ${i} of ${pageCount}`, 16, 288);
      }

      doc.save(`RYVOM_${client.full_name.replace(/\s+/g, "_")}_Report.pdf`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Complete Client Export (ZIP containing CSV + Report + Manifest)
  const handleExportZip = async () => {
    setIsGenerating(true);
    try {
      const zip = new JSZip();

      // 1. Snapshot text file
      zip.file("progress_summary.txt", generateSnapshotText());

      // 2. CSV Data
      const headers = [
        "Week Ending",
        "Weight (kg)",
        "Waist (cm)",
        "Diet (%)",
        "Training (%)",
        "Steps",
        "Sleep",
        "Hunger",
        "Energy",
        "Stress",
        "Status",
      ];
      const csv = [
        headers.join(","),
        ...checkIns.map((c) =>
          [
            c.week_ending,
            c.weight ?? "",
            c.waist_cm ?? "",
            c.diet_adherence ?? "",
            c.training_adherence ?? "",
            c.average_steps ?? "",
            c.sleep_hours ?? "",
            c.hunger ?? "",
            c.energy ?? "",
            c.stress ?? "",
            c.status,
          ].join(",")
        ),
      ].join("\n");
      zip.file("checkins_data.csv", csv);

      // 3. Photo links manifest
      const photoLinks = checkIns
        .filter((c) => c.photo_front_url || c.photo_side_url || c.photo_back_url)
        .map((c) => ({
          date: c.week_ending,
          front: c.photo_front_url,
          side: c.photo_side_url,
          back: c.photo_back_url,
        }));
      zip.file("photo_links.json", JSON.stringify(photoLinks, null, 2));

      // Generate zip file
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `RYVOM_${client.full_name.replace(/\s+/g, "_")}_Export.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Export & Progress Reports
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Snapshot Summary Preview */}
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              {dateRangeLabel} Progress Snapshot
            </span>
            <button
              onClick={handleCopySnapshot}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer bg-zinc-800 px-2.5 py-1 rounded"
            >
              {copiedSnapshot ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Text Snapshot
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-zinc-900 p-2 rounded">
              <span className="text-zinc-500 block text-[10px]">Weight Change</span>
              <span className="font-bold text-white">
                {formatDiff(weightSummary.absoluteChange, 1, "kg")}
              </span>
            </div>
            <div className="bg-zinc-900 p-2 rounded">
              <span className="text-zinc-500 block text-[10px]">Waist Change</span>
              <span className="font-bold text-white">
                {formatDiff(waistSummary.absoluteChange, 1, "cm")}
              </span>
            </div>
            <div className="bg-zinc-900 p-2 rounded">
              <span className="text-zinc-500 block text-[10px]">Diet Avg</span>
              <span className="font-bold text-white">
                {formatNum(dietSummary.average, 0, "", "%")}
              </span>
            </div>
            <div className="bg-zinc-900 p-2 rounded">
              <span className="text-zinc-500 block text-[10px]">Training Avg</span>
              <span className="font-bold text-white">
                {formatNum(trainingSummary.average, 0, "", "%")}
              </span>
            </div>
          </div>
        </div>

        {/* Report Options */}
        <div className="space-y-2 mb-5 text-xs text-zinc-300">
          <span className="font-semibold text-zinc-400 block mb-1">
            PDF Report Inclusions:
          </span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(e) => setIncludeHistory(e.target.checked)}
              className="rounded border-zinc-700 text-amber-400 focus:ring-0"
            />
            Include chronological check-in table
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePerformance}
              onChange={(e) => setIncludePerformance(e.target.checked)}
              className="rounded border-zinc-700 text-amber-400 focus:ring-0"
            />
            Include performance PR benchmarks
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeFeedback}
              onChange={(e) => setIncludeFeedback(e.target.checked)}
              className="rounded border-zinc-700 text-amber-400 focus:ring-0"
            />
            Include coach reviews & adjustments
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCoachNotes}
              onChange={(e) => setIncludeCoachNotes(e.target.checked)}
              className="rounded border-zinc-700 text-amber-400 focus:ring-0"
            />
            Include confidential coach notes
          </label>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-800">
          <button
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            Generate PDF
          </button>

          <button
            onClick={handleExportCSV}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            onClick={handleExportZip}
            disabled={isGenerating}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Archive className="w-4 h-4" />
            Complete ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
