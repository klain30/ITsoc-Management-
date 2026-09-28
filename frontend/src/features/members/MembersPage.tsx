import { UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { Pagination, SearchInput, Table, Td, Th, THead, Toolbar, Tr } from '@/components/ui/Table';
import { Can } from '@/features/auth/guards';
import { MEMBERSHIP_STATUS, ROLE_LABELS, ROLES, USER_STATUS, enumOptions, yearLabel } from '@/lib/labels';
import type { AccessLink, MembershipStatus, Role } from '@/types/api';

import { AccessLinkDialog } from './AccessLinkDialog';
import { useMembers } from './api';
import { MemberFormDialog } from './MemberFormDialog';

export default function MembersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [role, setRole] = useState<Role | ''>('');
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<{ link: AccessLink; name: string } | null>(null);
  const query = useMembers({ page, search, status, role });

  return (
    <>
      <PageHeader
        title="Members"
        description="Everyone in the organization, their standing and their account."
        actions={
          <Can permission="members:manage">
            <Button icon={UserPlus} onClick={() => setAdding(true)}>
              Add member
            </Button>
          </Can>
        }
      />
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name, email, student ID, course"
            className="w-full sm:w-80"
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as MembershipStatus | '');
              setPage(1);
            }}
            className="w-auto"
            aria-label="Membership status"
          >
            <option value="">All statuses</option>
            {enumOptions(MEMBERSHIP_STATUS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setPage(1);
            }}
            className="w-auto"
            aria-label="Role"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Toolbar>

        {query.isLoading ? (
          <LoadingBlock rows={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data && query.data.data.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Student ID</Th>
                  <Th>Course</Th>
                  <Th>Position / role</Th>
                  <Th>Membership</Th>
                  <Th>Account</Th>
                </tr>
              </THead>
              <tbody>
                {query.data.data.map((member) => (
                  <Tr key={member.id} onClick={() => navigate(`/members/${member.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={member.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{member.fullName}</p>
                          <p className="truncate text-xs text-fg-subtle">{member.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-fg-muted tabular">{member.studentId}</Td>
                    <Td className="text-fg-muted">
                      <span className="block max-w-56 truncate">{member.course}</span>
                      <span className="text-xs text-fg-subtle">{yearLabel(member.yearLevel)}</span>
                    </Td>
                    <Td>
                      {member.position ? <p className="text-sm">{member.position.name}</p> : null}
                      {member.account && member.account.role !== 'MEMBER' ? (
                        <Badge tone="primary">{ROLE_LABELS[member.account.role]}</Badge>
                      ) : !member.position ? (
                        <span className="text-fg-subtle">Member</span>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusBadge value={member.status} map={MEMBERSHIP_STATUS} />
                    </Td>
                    <Td>{member.account ? <StatusBadge value={member.account.status} map={USER_STATUS} /> : '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination meta={query.data.meta} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState icon={Users} title="No members match these filters" />
        )}
      </Card>

      {adding ? (
      <MemberFormDialog
        open
        onClose={() => setAdding(false)}
        onInvited={({ member, invitation }) => setInvite({ link: { ...invitation, type: 'INVITATION' }, name: member.fullName })}
      />
      ) : null}
      <AccessLinkDialog link={invite?.link ?? null} name={invite?.name ?? ''} onClose={() => setInvite(null)} />
    </>
  );
}
