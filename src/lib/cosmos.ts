import { CosmosClient, type Container, type Database } from "@azure/cosmos";

let client: CosmosClient | null = null;

function getDatabase(): Database {
  if (!client) {
    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    if (!connectionString) throw new Error("COSMOS_CONNECTION_STRING is not set");
    client = new CosmosClient(connectionString);
  }
  const databaseId = process.env.COSMOS_DATABASE;
  if (!databaseId) throw new Error("COSMOS_DATABASE is not set");
  return client.database(databaseId);
}

export function tracksContainer(): Container {
  return getDatabase().container(process.env.COSMOS_TRACKS_CONTAINER ?? "tracks");
}

export function chordproContainer(): Container {
  return getDatabase().container(process.env.COSMOS_CHORDPRO_CONTAINER ?? "chordpro");
}

export function playlistsContainer(): Container {
  return getDatabase().container(process.env.COSMOS_PLAYLISTS_CONTAINER ?? "playlists");
}
