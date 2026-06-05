"use client";

import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { companySlug } from "@/lib/contractors";
import type { Db, EmailAttachment, Project, ProjectEmailIntake } from "@/lib/types";

export function ProjectEmailTab({ db, project }: { db: Db; project: Project }) {
  const intakes = db.emailIntakes
    .filter((i) => i.projectId === project.id)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  if (intakes.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
        No email intake for this project yet. Drop a .msg file on the Projects dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {intakes.map((intake) => (
        <EmailIntakeBlock
          key={intake.id}
          intake={intake}
          attachments={db.emailAttachments.filter((a) => a.intakeId === intake.id)}
          companyName={project.sourceCompany ?? intake.company}
        />
      ))}
    </div>
  );
}

function EmailIntakeBlock({
  intake,
  attachments,
  companyName,
}: {
  intake: ProjectEmailIntake;
  attachments: EmailAttachment[];
  companyName: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3 space-y-1">
        <h3 className="font-medium text-gray-900">{intake.subject}</h3>
        <p className="text-sm text-gray-500">
          From {intake.fromName ? `${intake.fromName} ` : ""}
          &lt;{intake.fromEmail}&gt; · {formatDate(intake.receivedAt)}
          {intake.isForwarded && (
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs">Forwarded</span>
          )}
        </p>
        {companyName && (
          <p className="text-sm">
            Company:{" "}
            <Link
              href={`/contractors/${companySlug(companyName)}`}
              className="text-[#0f6b4f] underline"
            >
              {companyName}
            </Link>
          </p>
        )}
      </div>

      <div className="p-4">
        {intake.bodyHtml ? (
          <iframe
            title="Email body"
            sandbox=""
            srcDoc={intake.bodyHtml}
            className="w-full min-h-[240px] rounded border border-gray-100 bg-white"
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans max-h-[400px] overflow-y-auto">
            {intake.bodyText}
          </pre>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Attachments
          </h4>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/email-intake/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#0f6b4f] hover:bg-gray-50"
                >
                  {a.fileName}
                  <span className="ml-2 text-xs text-gray-400">
                    ({Math.round(a.size / 1024)} KB)
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
