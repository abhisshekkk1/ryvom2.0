"use client";

import React, { useState } from "react";
import { Lock, Plus, FileText, Trash2 } from "lucide-react";
import { CoachTimelineNote } from "@/lib/types";

interface CoachNotesTimelineProps {
  clientId?: string;
  notes: CoachTimelineNote[];
  onAddNote: (note: { note_date: string; note: string; category?: string }) => Promise<void>;
  onDeleteNote?: (noteId: string) => Promise<void>;
}

export default function CoachNotesTimeline({
  notes,
  onAddNote,
  onDeleteNote,
}: CoachNotesTimelineProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [noteText, setNoteText] = useState("");
  const [category, setCategory] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddNote({
        note_date: noteDate,
        note: noteText.trim(),
        category,
      });
      setNoteText("");
      setShowAddForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with Private Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/90 border border-zinc-800/80 p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Private Coach Timeline Notes
              <span className="text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/30 px-2 py-0.5 rounded-full font-medium">
                Coach Only
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              Personal observations, program adjustments, and coaching history. Never visible to the client.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {showAddForm ? "Close Form" : "Add Coach Note"}
        </button>
      </div>

      {/* Add Note Form */}
      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900/90 border border-zinc-800/80 p-4 rounded-xl space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Note Date
              </label>
              <input
                type="date"
                required
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="general">General Observation</option>
                <option value="training">Training & Volume</option>
                <option value="nutrition">Nutrition & Diet</option>
                <option value="recovery">Recovery & Sleep</option>
                <option value="mindset">Mindset & Motivation</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Coach Note *
            </label>
            <textarea
              rows={3}
              required
              placeholder="e.g. Increased training volume on compound lifts. Client reported sore knees, advised switching to box squats next block."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-bold rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Private Note"}
            </button>
          </div>
        </form>
      )}

      {/* Chronological Timeline */}
      {notes.length === 0 ? (
        <div className="bg-zinc-900/80 border border-zinc-800/80 p-8 rounded-xl text-center flex flex-col items-center justify-center">
          <FileText className="w-8 h-8 text-zinc-600 mb-2" />
          <h4 className="text-sm font-semibold text-white">No coach notes recorded yet</h4>
          <p className="text-xs text-zinc-400 max-w-sm mt-1">
            Keep a private running log of observations, training updates, and protocol changes across weeks.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
          {[...notes].sort((a, b) => new Date(b.note_date).getTime() - new Date(a.note_date).getTime()).map((note) => (
            <div key={note.id} className="relative group">
              {/* Timeline marker */}
              <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-zinc-950 ring-2 ring-zinc-800" />

              <div className="bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700/80 p-4 rounded-xl transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {new Date(note.note_date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded capitalize">
                      {note.category}
                    </span>
                  </div>

                  {onDeleteNote && (
                    <button
                      onClick={() => {
                        if (confirm("Delete this coach note?")) {
                          onDeleteNote(note.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {note.note}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
