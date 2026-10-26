import "server-only";

// Moderation wiring (Slice 5): how each reportable kind of content is checked, hidden and restored by
// its owning module. Lives in the app layer so the admin module does not import feature modules.
import type { TargetHandlers } from "@/modules/admin";
import { archive } from "@/modules/archive";
import { chatMessageText, messageForParticipant, setChatMessageHidden } from "@/modules/findmates";
import { moderationPost } from "@/modules/societies";
import { materials } from "@/modules/studymaterial";

const clip = (text: string | null | undefined) => (text ? text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) : null);

export const moderationTargets: TargetHandlers = {
  SOCIETY_POST: {
    visibleTo: (id) => moderationPost.exists(id),
    hide: (id) => moderationPost.remove(id),
    preview: async (id) => clip(await moderationPost.preview(id)),
  },
  STUDY_MATERIAL: {
    visibleTo: async (id) => (await materials.assetOf(id)) !== null,
    hide: (id) => materials.setHidden(id, true),
    restore: (id) => materials.setHidden(id, false),
    preview: async (id) => {
      const m = await materials.title(id);
      return m ? `${m.subjectCode}: ${m.title}` : null;
    },
  },
  ARCHIVE_PROJECT: {
    visibleTo: async (id, userId) => (await archive.get(userId, false, id)) !== null,
    hide: (id) => archive.withdraw(id, "Removed by moderation."),
    preview: async (id) => clip(await archive.projectTitle(id)),
  },
  ARCHIVE_COMMENT: {
    visibleTo: async (id) => (await archive.visibleComment(id)) !== null,
    hide: (id) => archive.setCommentHidden(id, true),
    restore: (id) => archive.setCommentHidden(id, false),
    preview: async (id) => clip(await archive.commentText(id)),
  },
  CHAT_MESSAGE: {
    // Only a participant of the conversation can report one of its messages.
    visibleTo: async (id, userId) => (await messageForParticipant(userId, id)) !== null,
    hide: (id) => setChatMessageHidden(id, true),
    restore: (id) => setChatMessageHidden(id, false),
    preview: async (id) => clip(await chatMessageText(id)),
  },
};
