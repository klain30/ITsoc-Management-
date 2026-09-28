import { useState } from 'react';

import { Select } from '@/components/ui/Form';
import { SearchInput } from '@/components/ui/Table';

import { useMembers } from './api';

/** Search-then-select for choosing one active member. */
export function MemberPicker({ value, onChange, id }: { value: string; onChange: (memberId: string) => void; id?: string }) {
  const [search, setSearch] = useState('');
  const query = useMembers({ page: 1, pageSize: 25, search, status: 'ACTIVE' });

  return (
    <div className="space-y-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Search members" />
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Member">
        <option value="">{query.isLoading ? 'Loading…' : 'Select a member'}</option>
        {query.data?.data.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName} · {m.studentId}
          </option>
        ))}
      </Select>
    </div>
  );
}
