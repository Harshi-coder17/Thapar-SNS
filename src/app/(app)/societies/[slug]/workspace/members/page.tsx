import type { Metadata } from "next";

import { listMembershipRequests, listSocietyMembers, POSITION_MAX } from "@/modules/societies";
import { formatRelative } from "@/shared/format";

import { MembersList } from "../../../_components/members-list";
import { RequestsList } from "../../../_components/requests-list";
import { loadWorkspace } from "../../load";

export const metadata: Metadata = { title: "Members" };

// Membership requests and members (display groups and titles; never permissions).
export default async function WorkspaceMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { society } = await loadWorkspace((await params).slug);
  const [requests, members] = await Promise.all([listMembershipRequests(society), listSocietyMembers(society)]);
  const now = new Date();
  return (
    <div className="space-y-8">
      {requests ? (
        <section aria-labelledby="requests-heading">
          <h2 id="requests-heading" className="mb-3 text-base font-semibold text-ink">
            Membership requests ({requests.length})
          </h2>
          <RequestsList
            societyId={society.id}
            requests={requests.map((request) => ({ id: request.id, person: request.person, message: request.message, requestedAt: formatRelative(request.createdAt, now) }))}
          />
        </section>
      ) : null}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-1 text-base font-semibold text-ink">
          Members ({members?.length ?? 0})
        </h2>
        <p className="mb-3 text-sm text-muted">Display groups and titles are shown on the society page. They do not give anyone access to this workspace; only Heads have access.</p>
        <MembersList societyId={society.id} members={members ?? []} manage={society.can["membership.edit"]} positionMax={POSITION_MAX} />
      </section>
    </div>
  );
}
