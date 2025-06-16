// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from '@sinclair/typebox';
import {
  EDStatic,
  StringRoomIDSchema,
  StringUserIDSchema,
} from 'matrix-protection-suite';

export interface RoomListQueryParams {
  from?: number; // Offset in the returned list, defaults to 0
  limit?: number; // Maximum amount of rooms to return, defaults to 100
  order_by?:
    | 'alphabetical'
    | 'size'
    | 'name'
    | 'canonical_alias'
    | 'joined_members'
    | 'joined_local_members'
    | 'version'
    | 'creator'
    | 'encryption'
    | 'federatable'
    | 'public'
    | 'join_rules'
    | 'guest_access'
    | 'history_visibility'
    | 'state_events'; // Sorting method, defaults to "name"
  dir?: 'f' | 'b'; // Direction of sorting, defaults to "f"
  search_term?: string; // Filter for room name, alias, or ID
  public_rooms?: boolean; // Optional flag to filter public rooms
  empty_rooms?: boolean; // Optional flag to filter empty rooms
}

export type RoomListRoom = EDStatic<typeof RoomListRoom>;
export const RoomListRoom = Type.Object(
  {
    room_id: StringRoomIDSchema,
    name: Type.Optional(
      Type.Union([
        Type.String({ description: 'The name of the room.' }),
        Type.Null(),
      ])
    ),
    canonical_alias: Type.Optional(
      Type.Union([
        Type.String({
          description: 'The canonical (main) alias address of the room.',
        }),
        Type.Null(),
      ])
    ),
    joined_members: Type.Number({
      description: 'How many users are currently in the room.',
    }),
    joined_local_members: Type.Number({
      description: 'How many local users are currently in the room.',
    }),
    version: Type.String({
      description: 'The version of the room as a string.',
    }),
    creator: StringUserIDSchema,
    encryption: Type.Optional(
      Type.Union([
        Type.String({
          description: 'Algorithm of end-to-end encryption of messages.',
        }),
        Type.Null(),
      ])
    ),
    federatable: Type.Boolean({
      description: 'Whether users on other servers can join this room.',
    }),
    public: Type.Boolean({
      description: 'Whether the room is visible in room directory.',
    }),
    join_rules: Type.Optional(
      Type.Union(
        [
          Type.Literal('public'),
          Type.Literal('knock'),
          Type.Literal('invite'),
          Type.Literal('private'),
          Type.Literal('restricted'),
          Type.Null(),
        ],
        {
          description:
            'The type of rules used for users wishing to join this room.',
        }
      )
    ),
    guest_access: Type.Optional(
      Type.Union(
        [Type.Literal('can_join'), Type.Literal('forbidden'), Type.Null()],
        { description: 'Whether guests can join the room.' }
      )
    ),
    history_visibility: Type.Optional(
      Type.Union(
        [
          Type.Literal('invited'),
          Type.Literal('joined'),
          Type.Literal('shared'),
          Type.Literal('world_readable'),
          Type.Null(),
        ],
        { description: 'Who can see the room history.' }
      )
    ),
    state_events: Type.Number({
      description:
        'Total number of state_events of a room. Complexity of the room.',
    }),
    room_type: Type.Optional(
      Type.Union([
        Type.String({
          description:
            "The type of the room taken from the room's creation event.",
        }),
        Type.Null(),
      ])
    ),
  },
  {
    description: 'An object containing information about a room.',
  }
);

export type RoomListResponse = EDStatic<typeof RoomListResponse>;
export const RoomListResponse = Type.Object(
  {
    rooms: Type.Array(RoomListRoom, {
      description:
        'An array of objects, each containing information about a room.',
    }),
    offset: Type.Optional(
      Type.Union([
        Type.Number({ description: 'The current pagination offset in rooms.' }),
        Type.Null(),
      ])
    ),
    total_rooms: Type.Optional(
      Type.Union([
        Type.Number({
          description: 'The total number of rooms returned.',
        }),
        Type.Null(),
      ])
    ),
    next_batch: Type.Optional(
      Type.Union([
        Type.Number({ description: 'Token to get the next page of results.' }),
        Type.Null(),
      ])
    ),
    prev_batch: Type.Optional(
      Type.Union([
        Type.Number({
          description: 'Token to get the previous page of results.',
        }),
        Type.Null(),
      ])
    ),
  },
  {
    description:
      'The JSON response body containing room listings and pagination information.',
  }
);
