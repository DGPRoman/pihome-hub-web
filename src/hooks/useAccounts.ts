import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { HubError } from '../api/errors'
import type { Account, Invitation, ManagedRole } from '../api/types'
import {
  changeAccount,
  createAccount,
  deleteAccount,
  fetchAccounts,
  issueInvitation,
  revokeInvitation,
  type AccountChange,
} from '../api/users'
import { userKeys } from './queryKeys'

/**
 * Every account on the hub.
 *
 * Polled like everything else, which is what lets an admin see an invitation get
 * used: somebody scans the code, and on the next read the account no longer has an
 * outstanding one. Mounted only for an admin — the route refuses everyone else, and
 * asking anyway would put a failure on screen for somebody who never asked to see
 * this.
 */
export function useAccounts() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: ({ signal }) => fetchAccounts(signal),
  })
}

/**
 * A write to the accounts, followed by a fresh read of them.
 *
 * Not optimistic, unlike a relay switch. These are rare and deliberate, the hub
 * may refuse one for a reason this client cannot see coming, and what the list
 * shows afterwards decides who can get into the house — which is the one thing
 * not to guess at.
 */
interface AccountWriteOptions<TData> {
  /**
   * Fold the hub's answer into the list straight away, for a write whose answer is
   * the account as it now stands. That is the hub speaking rather than a guess, and
   * it spares the row a moment of showing what it was before.
   */
  readonly remember?: (accounts: readonly Account[], answer: TData) => readonly Account[]
  /**
   * How long the finished mutation, and its answer, outlive whatever was watching
   * it. TanStack's default is minutes.
   */
  readonly gcTime?: number
}

function useAccountWrite<TData, TVariables>(
  write: (variables: TVariables) => Promise<TData>,
  { remember, gcTime }: AccountWriteOptions<TData> = {},
) {
  const queryClient = useQueryClient()

  return useMutation<TData, HubError, TVariables>({
    mutationFn: write,
    ...(gcTime === undefined ? {} : { gcTime }),
    onMutate: async () => {
      // A poll already in flight would land after the answer below and put back
      // the list from before it. Cancelled, and the read in onSettled replaces it.
      await queryClient.cancelQueries({ queryKey: userKeys.all })
    },
    onSuccess: (answer) => {
      if (remember !== undefined) {
        queryClient.setQueryData<readonly Account[]>(userKeys.all, (current) =>
          current === undefined ? current : remember(current, answer),
        )
      }
    },
    // Not returned, for the reason given in useSetRelay: awaiting the read would
    // hold the button in its pending state for as long as the read took.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

export interface NewAccount {
  readonly username: string
  readonly role: ManagedRole
}

export function useCreateAccount() {
  return useAccountWrite<Account, NewAccount>(({ username, role }) => createAccount(username, role))
}

export interface AccountChangeInput {
  readonly username: string
  readonly change: AccountChange
}

export function useChangeAccount() {
  return useAccountWrite<Account, AccountChangeInput>(
    ({ username, change }) => changeAccount(username, change),
    {
      remember: (accounts, updated) =>
        accounts.map((account) => (account.username === updated.username ? updated : account)),
    },
  )
}

export function useDeleteAccount() {
  return useAccountWrite<void, string>((username) => deleteAccount(username))
}

/**
 * Issue an invitation. The token comes back in this mutation's result and is not
 * written to the query cache, where every component could read it and where it
 * would outlive the moment it was needed for. PeoplePanel takes it from there.
 *
 * Collected the moment nothing is watching, too. A finished mutation stays in its
 * own cache for minutes by default, answer and all, and here the answer is a
 * credential: `reset` lets go of it only if the cache does as well.
 */
export function useIssueInvitation() {
  return useAccountWrite<Invitation, string>((username) => issueInvitation(username), {
    gcTime: 0,
  })
}

export function useRevokeInvitation() {
  return useAccountWrite<void, string>((username) => revokeInvitation(username))
}
