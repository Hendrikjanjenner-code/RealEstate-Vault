import {
  useQuery,
  useMutation,
} from "@tanstack/react-query";
import type {
  UseQueryOptions,
  UseQueryResult,
  UseMutationOptions,
  MutationFunction,
  QueryFunction,
  QueryKey,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

// ── Manual additions: auth session + broker login + set-role ─────────────────

export interface SessionResponse {
  broker: boolean;
}

export interface BrokerLoginRequest {
  passcode: string;
}

export const getGetSessionQueryKey = () => ['getSession'] as const;

export const getSession = async (options?: Parameters<typeof customFetch>[1]): Promise<SessionResponse> => {
  return customFetch<SessionResponse>('/api/auth/session', { method: 'GET', ...options });
};

export const getGetSessionQueryOptions = <TData = SessionResponse, TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<SessionResponse, TError, TData>; request?: SecondParameter<typeof customFetch> }
): UseQueryOptions<SessionResponse, TError, TData> & { queryKey: QueryKey } => {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetSessionQueryKey();
  const queryFn: QueryFunction<SessionResponse> = ({ signal }) => getSession({ signal, ...requestOptions });
  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<SessionResponse, TError, TData> & { queryKey: QueryKey };
};

export function useGetSession<TData = SessionResponse, TError = ErrorType<unknown>>(
  options?: { query?: UseQueryOptions<SessionResponse, TError, TData>; request?: SecondParameter<typeof customFetch> }
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const queryOptions = getGetSessionQueryOptions(options);
  const query = useQuery(queryOptions) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  query.queryKey = queryOptions.queryKey;
  return query;
}

export const brokerLogin = async (data: BrokerLoginRequest, options?: Parameters<typeof customFetch>[1]): Promise<SessionResponse> => {
  return customFetch<SessionResponse>('/api/auth/broker-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...options,
  });
};

export const useBrokerLogin = <TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<SessionResponse, TError, { data: BrokerLoginRequest }, TContext>; request?: SecondParameter<typeof customFetch> }
) => {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<SessionResponse, { data: BrokerLoginRequest }> = (props) => {
    const { data } = props;
    return brokerLogin(data, requestOptions);
  };
  return useMutation<SessionResponse, TError, { data: BrokerLoginRequest }, TContext>({ mutationFn, ...mutationOptions });
};
