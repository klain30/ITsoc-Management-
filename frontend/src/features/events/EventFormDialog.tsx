import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, Input, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { fromLocalInput, toLocalInput } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import type { EventItem } from '@/types/api';

import { useCreateEvent, useUpdateEvent } from './api';

const schema = z
  .object({
    name: z.string().trim().min(3, 'At least 3 characters.').max(150),
    location: z.string().trim().min(2, 'Where is it held?').max(200),
    description: z.string().trim().max(5000).optional(),
    startsAt: z.string().min(1, 'Pick a start date and time.'),
    endsAt: z.string().min(1, 'Pick an end date and time.'),
    registrationDeadline: z.string().min(1, 'Pick a registration deadline.'),
    capacity: z.coerce.number({ invalid_type_error: 'Enter a number.' }).int().min(1, 'At least 1.').max(10_000),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { path: ['endsAt'], message: 'Must be after the start.' })
  .refine((v) => new Date(v.registrationDeadline) <= new Date(v.startsAt), {
    path: ['registrationDeadline'],
    message: 'Registration must close before the event starts.',
  });

type Values = z.infer<typeof schema>;
const FIELDS = ['name', 'location', 'description', 'startsAt', 'endsAt', 'registrationDeadline', 'capacity'] as const;

const defaults = (event?: EventItem): Values =>
  event
    ? {
        name: event.name,
        location: event.location,
        description: event.description ?? '',
        startsAt: toLocalInput(event.startsAt),
        endsAt: toLocalInput(event.endsAt),
        registrationDeadline: toLocalInput(event.registrationDeadline),
        capacity: event.capacity,
      }
    : { name: '', location: '', description: '', startsAt: '', endsAt: '', registrationDeadline: '', capacity: 50 };

export function EventFormDialog({ open, onClose, event, onSaved }: { open: boolean; onClose: () => void; event?: EventItem; onSaved?: (event: EventItem) => void }) {
  const toast = useToast();
  const create = useCreateEvent();
  const update = useUpdateEvent(event?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(event) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const input = {
      ...values,
      description: values.description || null,
      startsAt: fromLocalInput(values.startsAt),
      endsAt: fromLocalInput(values.endsAt),
      registrationDeadline: fromLocalInput(values.registrationDeadline),
    };
    try {
      const saved = event ? await update.mutateAsync(input) : await create.mutateAsync(input);
      toast.success(event ? 'Event updated.' : 'Event created as a draft. Publish it when it’s ready.');
      onSaved?.(saved);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      description={event ? undefined : 'New events start as drafts that only officers can see.'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="event-form" loading={isSubmitting}>
            {event ? 'Save changes' : 'Create event'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormError message={formError} />
        </div>
        <Field label="Event name" required error={errors.name?.message} className="sm:col-span-2">
          {(f) => <Input {...f} {...register('name')} placeholder="e.g. Intro to Git & GitHub Workshop" />}
        </Field>
        <Field label="Location" required error={errors.location?.message}>
          {(f) => <Input {...f} {...register('location')} placeholder="e.g. Computer Laboratory 3" />}
        </Field>
        <Field label="Capacity" required error={errors.capacity?.message}>
          {(f) => <Input {...f} type="number" min={1} {...register('capacity')} />}
        </Field>
        <Field label="Starts" required error={errors.startsAt?.message}>
          {(f) => <Input {...f} type="datetime-local" {...register('startsAt')} />}
        </Field>
        <Field label="Ends" required error={errors.endsAt?.message}>
          {(f) => <Input {...f} type="datetime-local" {...register('endsAt')} />}
        </Field>
        <Field label="Registration deadline" required error={errors.registrationDeadline?.message} hint="Members can register until this time.">
          {(f) => <Input {...f} type="datetime-local" {...register('registrationDeadline')} />}
        </Field>
        <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
          {(f) => <Textarea {...f} rows={4} {...register('description')} placeholder="What should members expect? What should they bring?" />}
        </Field>
      </form>
    </Dialog>
  );
}
