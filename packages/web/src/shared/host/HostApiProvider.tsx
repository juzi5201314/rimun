import type { RimunHostApi } from "@rimun/shared";
import {
  type PropsWithChildren,
  createContext,
  useContext,
  useState,
} from "react";
import { createElectrobunHostApi } from "./createElectrobunHostApi";
import { createHttpHostApi } from "./createHttpHostApi";

type HostApiContextValue = {
  getHostApi: () => Promise<RimunHostApi>;
};

const HostApiContext = createContext<HostApiContextValue | null>(null);

function createHostApiGetter(hostApi?: RimunHostApi) {
  if (hostApi) {
    return async () => hostApi;
  }

  let hostApiPromise: Promise<RimunHostApi> | undefined;

  return async () => {
    hostApiPromise ??= (async () => {
      try {
        return await createElectrobunHostApi();
      } catch {
        return createHttpHostApi();
      }
    })();

    return hostApiPromise;
  };
}

export function HostApiProvider({
  children,
  hostApi,
}: PropsWithChildren<{ hostApi?: RimunHostApi }>) {
  const [value] = useState<HostApiContextValue>(() => ({
    getHostApi: createHostApiGetter(hostApi),
  }));

  return (
    <HostApiContext.Provider value={value}>{children}</HostApiContext.Provider>
  );
}

export function useHostApi() {
  const context = useContext(HostApiContext);

  if (!context) {
    throw new Error("HostApiProvider is missing.");
  }

  return context.getHostApi;
}
