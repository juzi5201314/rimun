import { useBootstrapQuery } from "@/features/bootstrap/hooks/useBootstrapQuery";
import { Link } from "react-router-dom";

function renderEnvironmentLabel(platform: string, isWsl: boolean) {
  if (isWsl) {
    return `${platform} (WSL)`;
  }

  return platform;
}

export function HomePage() {
  const bootstrapQuery = useBootstrapQuery();

  if (bootstrapQuery.isPending) {
    return <p>Loading bootstrap...</p>;
  }

  if (bootstrapQuery.isError) {
    return <p role="alert">Failed to load bootstrap data.</p>;
  }

  const { environment, preferredSelection, settings } = bootstrapQuery.data;
  const preferredPaths = preferredSelection
    ? [
        {
          kind: "installation",
          path: preferredSelection.installationPath,
        },
        {
          kind: "workshop",
          path: preferredSelection.workshopPath,
        },
        {
          kind: "config",
          path: preferredSelection.configPath,
        },
      ].filter((candidate) => candidate.path)
    : [];

  return (
    <section aria-labelledby="home-heading">
      <h2 id="home-heading">Home</h2>
      <p>Desktop shell and bridge status are wired.</p>

      <dl>
        <dt>Runtime</dt>
        <dd>
          {renderEnvironmentLabel(environment.platform, environment.isWsl)}
        </dd>
        <dt>Configured channel</dt>
        <dd>{settings.channel}</dd>
      </dl>

      <h3>Preferred paths</h3>

      {preferredPaths.length > 0 ? (
        <ul>
          {preferredPaths.map((candidate) => (
            <li key={`${candidate.kind}:${candidate.path}`}>
              <strong>{candidate.kind}</strong>: {candidate.path}
            </li>
          ))}
        </ul>
      ) : (
        <p>No automatic path detection result yet.</p>
      )}

      <p>
        <Link to="/settings">Open settings</Link>
      </p>
    </section>
  );
}
