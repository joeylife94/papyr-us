import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { OrganizationApiError, organizationRequest } from './api';

interface AdminOrganization {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  aiEnabled: boolean;
  memberCount: number;
  ownerCount: number;
  createdAt: string;
}

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is at most 100 characters'),
  slug: z
    .string()
    .regex(
      SLUG_PATTERN,
      'Use 1 to 40 lowercase letters, numbers or hyphens, starting and ending with a letter or number'
    ),
  ownerEmail: z.string().trim().min(1, 'Owner email is required'),
});
type CreateValues = z.infer<typeof createSchema>;

const ownerSchema = z.object({ email: z.string().trim().min(1, 'Email is required') });
type OwnerValues = z.infer<typeof ownerSchema>;

/** The eligibility codes of POST /api/admin/organizations (409 account_not_eligible). */
const REASON_TEXT: Record<string, string> = {
  holds_role: 'is an owner or admin of another organization',
  team_memberships: 'belongs to a team',
  authored_pages: 'has written pages',
  page_grants: 'has been given access to pages',
  comments: 'has written comments',
  roster_rows: 'is on a team roster',
};

/** A sentence for a refusal that has no field of its own. */
function generalErrorText(error: unknown, action: string): string {
  if (error instanceof OrganizationApiError) {
    if (error.status === 503) return 'The organization is busy with another change. Try again.';
    if (error.status === 429) return 'Too many requests. Wait a moment and try again.';
    if (error.status === 403) return 'Only platform admins can do this.';
    if (error.status === 400) return 'Some of the values are not valid. Check them and try again.';
  }
  return `Could not ${action}. Try again in a moment.`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export function AdminOrganizationsTab({ userId }: { userId: number | undefined }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [ownerTarget, setOwnerTarget] = useState<AdminOrganization | null>(null);
  const queryKey = ['/api/admin/organizations', userId];

  const {
    data: organizations,
    isLoading,
    isError,
    refetch,
  } = useQuery<AdminOrganization[]>({
    queryKey,
    queryFn: () => organizationRequest<AdminOrganization[]>('/api/admin/organizations'),
    enabled: userId != null,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  return (
    <div className="space-y-6" data-testid="admin-organizations-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Organization Management</h2>
          <p className="text-foreground-secondary">
            Create organizations and name their first owner
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="new-organization-button">
          <Plus className="h-4 w-4 mr-2" />
          New organization
        </Button>
      </div>

      {isLoading ? (
        <p className="text-foreground-secondary" data-testid="organizations-loading">
          Loading organizations…
        </p>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="organizations-error">
          <p className="text-foreground-secondary">Could not load the organizations.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table data-testid="organizations-table">
            <TableHeader>
              <TableRow>
                <TableHead className="px-2 sm:px-4">Name</TableHead>
                <TableHead className="hidden md:table-cell">Slug</TableHead>
                <TableHead className="hidden px-2 text-right sm:table-cell sm:px-4">
                  Members
                </TableHead>
                <TableHead className="px-2 text-right sm:px-4">Owners</TableHead>
                <TableHead className="px-2 sm:px-4">AI</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="px-2 text-right sm:px-4">
                  <span className="sr-only sm:not-sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(organizations ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-foreground-secondary">
                    No organizations yet.
                  </TableCell>
                </TableRow>
              ) : (
                (organizations ?? []).map((organization) => (
                  <TableRow
                    key={organization.id}
                    data-testid={`organization-row-${organization.slug}`}
                  >
                    <TableCell className="max-w-[6rem] break-words px-2 font-medium sm:max-w-none sm:px-4">
                      {organization.name}
                      <div className="break-all font-mono text-xs font-normal text-foreground-secondary md:hidden">
                        {organization.slug}
                      </div>
                    </TableCell>
                    <TableCell className="hidden break-all font-mono text-sm md:table-cell">
                      {organization.slug}
                    </TableCell>
                    <TableCell className="hidden px-2 text-right sm:table-cell sm:px-4">
                      {organization.memberCount}
                    </TableCell>
                    <TableCell className="px-2 text-right sm:px-4">
                      {organization.ownerCount}
                    </TableCell>
                    <TableCell className="px-2 sm:px-4">
                      <Badge
                        className="whitespace-nowrap"
                        variant={organization.aiEnabled ? 'default' : 'secondary'}
                        data-testid={`organization-ai-${organization.slug}`}
                      >
                        {organization.aiEnabled ? 'AI on' : 'AI off'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {formatDate(organization.createdAt)}
                    </TableCell>
                    <TableCell className="px-2 text-right sm:px-4">
                      {organization.ownerCount === 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Set owner of ${organization.name}`}
                          onClick={() => setOwnerTarget(organization)}
                          data-testid={`set-owner-${organization.slug}`}
                        >
                          <UserPlus className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Set owner</span>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {createOpen ? (
        <CreateOrganizationDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            refresh();
            toast({
              title: 'Organization created',
              description: `${created.organization.name} now has ${created.owner.email} as its owner. AI is turned off.`,
            });
          }}
        />
      ) : null}

      {ownerTarget ? (
        <SetOwnerDialog
          organization={ownerTarget}
          onClose={() => setOwnerTarget(null)}
          onDone={(email) => {
            const name = ownerTarget.name;
            setOwnerTarget(null);
            refresh();
            toast({ title: 'Owner set', description: `${email} is now the owner of ${name}.` });
          }}
          onStale={refresh}
        />
      ) : null}
    </div>
  );
}

interface Created {
  organization: { id: number; slug: string; name: string };
  owner: { userId: number; email: string };
}

function CreateOrganizationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: Created) => void;
}) {
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', slug: '', ownerEmail: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateValues) =>
      organizationRequest<Created>('/api/admin/organizations', { method: 'POST', body: values }),
    onSuccess: onCreated,
    onError: (error) => {
      if (error instanceof OrganizationApiError) {
        if (error.status === 409 && error.code === 'slug_taken') {
          form.setError('slug', { message: 'This slug is already in use. Choose another one.' });
          return;
        }
        if (error.status === 409 && error.code === 'account_not_eligible') {
          form.setError('ownerEmail', { message: 'This account cannot be named owner.' });
          setReasons(error.reasons ?? []);
          return;
        }
        if (error.status === 404) {
          form.setError('ownerEmail', { message: 'No account with this email' });
          return;
        }
      }
      setFormError(generalErrorText(error, 'create the organization'));
    },
  });

  const submit = (values: CreateValues) => {
    setReasons(null);
    setFormError(null);
    mutation.mutate(values);
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !mutation.isPending ? onClose() : undefined)}>
      <DialogContent className="max-w-md" data-testid="new-organization-dialog">
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>
            The organization starts with AI turned off. Its owner can turn it on in the organization
            settings.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Inc." autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input placeholder="acme" autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>
                    Lowercase letters, numbers and hyphens. It cannot be changed later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ownerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Owner email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="owner@example.com"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A registered account that has not used another organization yet.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {reasons ? (
              <div
                className="rounded-md border border-border bg-raised p-3 text-sm"
                role="alert"
                data-testid="owner-not-eligible"
              >
                {reasons.length > 0 ? (
                  <>
                    <p className="font-medium text-foreground">This account:</p>
                    <ul className="list-disc pl-5 text-foreground-secondary">
                      {reasons.map((reason) => (
                        <li key={reason}>
                          {REASON_TEXT[reason] ?? 'has data in another organization'}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                <p className="mt-2 text-foreground-secondary">
                  Only an account that has not used another organization yet can be named owner.
                </p>
              </div>
            ) : null}
            {formError ? (
              <p className="text-sm text-destructive" role="alert" data-testid="create-error">
                {formError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="create-organization-submit"
              >
                {mutation.isPending ? 'Creating…' : 'Create organization'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SetOwnerDialog({
  organization,
  onClose,
  onDone,
  onStale,
}: {
  organization: AdminOrganization;
  onClose: () => void;
  onDone: (email: string) => void;
  onStale: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<OwnerValues>({
    resolver: zodResolver(ownerSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: OwnerValues) =>
      organizationRequest<{ userId: number; email: string }>(
        `/api/admin/organizations/${organization.id}/owners`,
        { method: 'POST', body: values }
      ),
    onSuccess: (result) => onDone(result.email),
    onError: (error) => {
      if (error instanceof OrganizationApiError) {
        if (error.status === 404 && error.serverMessage === 'Organization not found') {
          setFormError('This organization no longer exists.');
          onStale();
          return;
        }
        if (error.status === 404) {
          form.setError('email', {
            message:
              'No member of this organization has this email. Use the email of an existing member.',
          });
          return;
        }
        if (error.status === 409 && error.code === 'organization_has_owner') {
          setFormError('This organization already has an owner.');
          onStale();
          return;
        }
      }
      setFormError(generalErrorText(error, 'set the owner'));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (!open && !mutation.isPending ? onClose() : undefined)}>
      <DialogContent className="max-w-md" data-testid="set-owner-dialog">
        <DialogHeader>
          <DialogTitle>Set owner of {organization.name}</DialogTitle>
          <DialogDescription>
            Name an existing member of this organization as its owner. This is only possible while
            the organization has no owner.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => {
              setFormError(null);
              mutation.mutate(values);
            })}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="member@example.com"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {formError ? (
              <p className="text-sm text-destructive" role="alert" data-testid="set-owner-error">
                {formError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="set-owner-submit">
                {mutation.isPending ? 'Saving…' : 'Set owner'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
