import { Collection } from "discord.js";

export interface MockRole {
  id: string;
  name: string;
}

export interface MockMember {
  id: string;
  roles: {
    cache: Collection<string, MockRole>;
    add: (role: MockRole) => Promise<void>;
    remove: (role: MockRole) => Promise<void>;
  };
  kick: (reason?: string) => Promise<void>;
}

export interface MockGuild {
  id: string;
  name: string;
  members: {
    cache: Collection<string, MockMember>;
    fetch: () => Promise<Collection<string, MockMember>>;
  };
  roles: {
    cache: Collection<string, MockRole>;
  };
  channels: {
    cache: Collection<string, any>;
  };
}

export interface MockUser {
  id: string;
  send: (content: any) => Promise<any>;
}

export interface MockClient {
  guilds: {
    cache: Collection<string, MockGuild>;
  };
  users: {
    fetch: (id: string) => Promise<MockUser>;
  };
}

export function createMockRole(id: string, name: string): MockRole {
  return { id, name };
}

export function createMockMember(
  id: string,
  roles: MockRole[] = [],
  callbacks?: {
    onRoleAdd?: (role: MockRole) => void;
    onRoleRemove?: (role: MockRole) => void;
    onKick?: (reason?: string) => void;
  },
): MockMember {
  const roleCollection = new Collection<string, MockRole>();
  roles.forEach((r) => roleCollection.set(r.id, r));

  return {
    id,
    roles: {
      cache: roleCollection,
      add: async (role: MockRole) => {
        roleCollection.set(role.id, role);
        callbacks?.onRoleAdd?.(role);
      },
      remove: async (role: MockRole) => {
        roleCollection.delete(role.id);
        callbacks?.onRoleRemove?.(role);
      },
    },
    kick: async (reason?: string) => {
      callbacks?.onKick?.(reason);
    },
  };
}

export function createMockGuild(
  id: string,
  name: string,
  members: MockMember[] = [],
  roles: MockRole[] = [],
): MockGuild {
  const memberCollection = new Collection<string, MockMember>();
  members.forEach((m) => memberCollection.set(m.id, m));

  const roleCollection = new Collection<string, MockRole>();
  roles.forEach((r) => roleCollection.set(r.id, r));

  return {
    id,
    name,
    members: {
      cache: memberCollection,
      fetch: async () => memberCollection,
    },
    roles: {
      cache: roleCollection,
    },
    channels: {
      cache: new Collection(),
    },
  };
}

export function createMockClient(
  guilds: MockGuild[] = [],
  users: Map<string, MockUser> = new Map(),
): MockClient {
  const guildCollection = new Collection<string, MockGuild>();
  guilds.forEach((g) => guildCollection.set(g.id, g));

  return {
    guilds: {
      cache: guildCollection,
    },
    users: {
      fetch: async (id: string) => {
        const user = users.get(id);
        if (!user) throw new Error(`User ${id} not found`);
        return user;
      },
    },
  };
}

export function createMockUser(
  id: string,
  callbacks?: { onSend?: (content: any) => void },
): MockUser {
  return {
    id,
    send: async (content: any) => {
      callbacks?.onSend?.(content);
      return {};
    },
  };
}
