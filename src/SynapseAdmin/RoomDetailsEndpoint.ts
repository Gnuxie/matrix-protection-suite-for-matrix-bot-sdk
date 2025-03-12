// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from '@sinclair/typebox';
import {
  EDStatic,
  StringRoomAliasSchema,
  StringRoomIDSchema,
  StringUserIDSchema,
} from 'matrix-protection-suite';

export type RoomDetailsResponse = EDStatic<typeof RoomDetailsResponse>;
export const RoomDetailsResponse = Type.Object({
  room_id: Type.Union(
    [StringRoomIDSchema],
    Type.String({ description: 'The ID of the room.' })
  ),
  name: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'The name of the room.',
    })
  ),
  topic: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'The topic of the room.',
    })
  ),
  avatar: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'The mxc URI to the avatar of the room.',
    })
  ),
  canonical_alias: Type.Optional(
    Type.Union([StringRoomAliasSchema, Type.String(), Type.Null()], {
      description: 'The canonical (main) alias address of the room.',
    })
  ),
  joined_members: Type.Number({
    description: 'How many users are currently in the room.',
  }),
  joined_local_members: Type.Number({
    description: 'How many local users are currently in the room.',
  }),
  joined_local_devices: Type.Number({
    description: 'How many local devices are currently in the room.',
  }),
  version: Type.String({ description: 'The version of the room as a string.' }),
  creator: Type.Union([StringUserIDSchema], {
    description: 'The user_id of the room creator.',
  }),
  encryption: Type.Union([Type.String(), Type.Null()], {
    description:
      'Algorithm of end-to-end encryption of messages. Null if encryption is not active.',
  }),
  federatable: Type.Boolean({
    description: 'Whether users on other servers can join this room.',
  }),
  public: Type.Boolean({
    description: 'Whether the room is visible in the room directory.',
  }),
  join_rules: Type.Union(
    [
      Type.Literal('public'),
      Type.Literal('knock'),
      Type.Literal('invite'),
      Type.Literal('private'),
    ],
    {
      description:
        'The type of rules used for users wishing to join this room.',
    }
  ),
  guest_access: Type.Union(
    [Type.Literal('can_join'), Type.Literal('forbidden'), Type.Null()],
    { description: 'Whether guests can join the room.' }
  ),
  history_visibility: Type.Union(
    [
      Type.Literal('invited'),
      Type.Literal('joined'),
      Type.Literal('shared'),
      Type.Literal('world_readable'),
    ],
    { description: 'Who can see the room history.' }
  ),
  state_events: Type.Number({
    description:
      'Total number of state events in the room. Represents the complexity of the room.',
  }),
  room_type: Type.Union([Type.String(), Type.Null()], {
    description:
      "The type of the room from the room's creation event, e.g., 'm.space'. Null if not defined.",
  }),
  forgotten: Type.Boolean({
    description: 'Whether all local users have forgotten the room.',
  }),
});
