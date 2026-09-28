import { ArrowLeft, KeyRound, Pencil, Power, Trash } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Avatar, Card, CardBody, CardHeader, DetailList, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/useAuth';
import { formatDate, formatDateTime } from '@/lib/format';
import { MEMBERSHIP_STATUS, ROLE_LABELS, ROLES, USER_STATUS, yearLabel } from '@/lib/labels';
import type { AccessLink, Role } from '@/types/api';

import { AccessLinkDialog } from './AccessLinkDialog';
import { useChangeAccountStatus, useChangeRole, useDeleteMember, useIssueAccessLink, useMember } from './api';
import { MemberFormDialog } from './MemberFormDialog';

export default function MemberDetailPage() {
  const { id = '' } = useParams();
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useMember(id);
  const changeRole = useChangeRole(id);
  const changeStatus = useChangeAccountStatus(id);
  const issueLink = useIssueAccessLink();
  const remove = useDeleteMember();
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState<AccessLink | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'disable' | null>(null);

  if (query.isLoading) return <LoadingBlock rows={8} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const member = query.data;
  const account = member.account;
  const isSelf = account?.userId === user?.id;
  const { summary } = member;

  return (
    <>
      <PageHeader
        eyebrow={
          can('members:read') ? (
            <Link to="/members" className="inline-flex items-center gap-1 hover:text-fg">
              <ArrowLeft size={14} aria-hidden /> Members
            </Link>
          ) : null
        }
        title={
          <span className="flex items-center gap-3">
            <Avatar name={member.fullName} />
            {member.fullName}
          </span>
        }
        actions={
          <>
            {can('members:manage') ? (
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {can('members:manage') && account && account.status !== 'DISABLED' && !isSelf && (account.status === 'INVITED' || can('roles:assign')) ? (
              <Button
                variant="secondary"
                icon={KeyRound}
                loading={issueLink.isPending}
                onClick={() => issueLink.mutate(id, { onSuccess: (result) => result && setLink(result), onError: toast.error })}
              >
                {account.status === 'INVITED' ? 'New invite link' : 'Reset password link'}
              </Button>
            ) : null}
            {can('roles:assign') && !isSelf ? (
              <Button variant="danger-ghost" icon={Trash} onClick={() => setConfirm('delete')}>
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Profile" />
          <CardBody>
            <DetailList
              items={[
                { label: 'Student ID', value: member.studentId },
                { label: 'Email', value: member.email },
                { label: 'Course', value: member.course },
                { label: 'Year & section', value: `${yearLabel(member.yearLevel)}${member.section ? ` · ${member.section}` : ''}` },
                { label: 'Contact number', value: member.contactNumber ?? '—' },
                { label: 'Membership', value: <StatusBadge value={member.status} map={MEMBERSHIP_STATUS} /> },
                { label: 'Date joined', value: formatDate(member.dateJoined) },
                { label: 'Current position', value: member.position ? `${member.position.name} since ${formatDate(member.position.since)}` : 'None' },
              ]}
            />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account" />
            <CardBody className="space-y-4">
              {account ? (
                <>
                  <DetailList
                    className="sm:grid-cols-1"
                    items={[
                      { label: 'Status', value: <StatusBadge value={account.status} map={USER_STATUS} /> },
                      { label: 'Last sign-in', value: formatDateTime(account.lastLoginAt) },
                    ]}
                  />
                  {can('roles:assign') && !isSelf ? (
                    <>
                      <Field label="Role" hint="Takes effect on the member’s next request.">
                        {(f) => (
                          <Select
                            {...f}
                            value={account.role}
                            disabled={changeRole.isPending}
                            onChange={(e) =>
                              changeRole.mutate(e.target.value as Role, {
                                onSuccess: () => toast.success('Role updated.'),
                                onError: toast.error,
                              })
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      {account.status === 'ACTIVE' ? (
                        <Button variant="danger-ghost" icon={Power} className="w-full" onClick={() => setConfirm('disable')}>
                          Disable account
                        </Button>
                      ) : account.status === 'DISABLED' ? (
                        <Button
                          variant="secondary"
                          icon={Power}
                          className="w-full"
                          loading={changeStatus.isPending}
                          onClick={() => changeStatus.mutate('ACTIVE', { onSuccess: () => toast.success('Account enabled.'), onError: toast.error })}
                        >
                          Enable account
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-fg-muted">Role: {ROLE_LABELS[account.role]}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-fg-muted">No account.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Participation" />
            <CardBody>
              <DetailList
                items={[
                  { label: 'Registrations', value: summary.registrations },
                  { label: 'Certificates', value: summary.certificates },
                  { label: 'Present', value: summary.attendance.PRESENT ?? 0 },
                  { label: 'Late / absent', value: `${summary.attendance.LATE ?? 0} / ${summary.attendance.ABSENT ?? 0}` },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      {summary.positionHistory.length > 0 ? (
        <Card className="mt-6">
          <CardHeader title="Officer history" />
          <ul className="divide-y divide-border">
            {summary.positionHistory.map((p) => (
              <li key={p.id} className="flex justify-between px-5 py-3 text-sm">
                <span className="font-medium">{p.position.name}</span>
                <span className="text-fg-muted">
                  {formatDate(p.startDate)} – {p.endDate ? formatDate(p.endDate) : 'present'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editing ? <MemberFormDialog open onClose={() => setEditing(false)} member={member} /> : null}
      <AccessLinkDialog link={link} name={member.fullName} onClose={() => setLink(null)} />
      <ConfirmDialog
        open={confirm === 'disable'}
        onClose={() => setConfirm(null)}
        title="Disable this account?"
        description="The member is signed out everywhere and cannot sign in until the account is enabled again."
        confirmLabel="Disable"
        tone="danger"
        loading={changeStatus.isPending}
        onConfirm={() =>
          changeStatus.mutate('DISABLED', {
            onSuccess: () => {
              toast.success('Account disabled.');
              setConfirm(null);
            },
            onError: toast.error,
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete this member?"
        description="Only members without any history can be deleted. For everyone else, set the membership to Inactive or Alumni."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success('Member deleted.');
              navigate('/members');
            },
            onError: (e) => {
              setConfirm(null);
              toast.error(e);
            },
          })
        }
      />
    </>
  );
}
