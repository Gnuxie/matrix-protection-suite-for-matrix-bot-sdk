/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import {
  ActionError,
  ActionResult,
  MatrixRoomReference,
  POLICY_ROOM_TYPE,
  SHORTCODE_EVENT_TYPE,
  PolicyListManager,
  RoomCreateOptions,
  POLICY_ROOM_TYPE_VARIANTS,
  UserID,
  MatrixRoomID,
  ActionException,
  ActionExceptionKind,
  Ok,
  isError,
  PolicyRuleEvent,
  isPolicyRuleEvent,
  PolicyListRevisionIssuer,
  StandardPolicyListRevisionIssuer,
  StandardPolicyListRevision,
  PolicyListRevision,
  PolicyListEditor,
} from 'brokkr';
import { MatrixSendClient } from '../MatrixEmitter';
import { BotSDKPolicyListEditor } from './PolicyListEditor';

export class BotSDKPolicyListManager implements PolicyListManager {
  // TOOD: you know, it would be good to have a generic singleton tracker type
  // that accepted a create thunk.
  // it would be less error prone too.
  private readonly issuedLists: Map<
    string /*room id*/,
    PolicyListRevisionIssuer
  > = new Map();

  private readonly issuedEditors: Map<string /*room id*/, PolicyListEditor> =
    new Map();

  constructor(private readonly client: MatrixSendClient) {
    // nothing to do.
  }
  public async getListEditor(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyListEditor>> {
    const existingEditor = this.issuedEditors.get(room.toRoomIdOrAlias());
    if (existingEditor !== undefined) {
      return Ok(existingEditor);
    }
    const issuer = await this.getListRevisionIssuer(room);
    if (isError(issuer)) {
      return issuer;
    }
    const editor = new BotSDKPolicyListEditor(this.client, room, issuer.ok);
    this.issuedEditors.set(room.toRoomIdOrAlias(), editor);
    return Ok(editor);
  }

  public async createList(
    shortcode: string,
    invite: string[],
    createRoomOptions: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomReference, ActionError>> {
    const rawCreatorResult = await this.client.getUserId().then(
      (user) => Ok(user),
      (exception) =>
        ActionException.Result(
          'Could not create a list because we could not find the mxid of the list creator.',
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
    if (isError(rawCreatorResult)) {
      return rawCreatorResult;
    }
    const creator = new UserID(rawCreatorResult.ok);
    const powerLevels: RoomCreateOptions['power_level_content_override'] = {
      ban: 50,
      events: {
        'm.room.name': 100,
        'm.room.power_levels': 100,
      },
      events_default: 50, // non-default
      invite: 0,
      kick: 50,
      notifications: {
        room: 20,
      },
      redact: 50,
      state_default: 50,
      users: {
        [creator.toString()]: 100,
        ...invite.reduce((users, mxid) => ({ ...users, [mxid]: 50 }), {}),
      },
      users_default: 0,
    };
    const finalRoomCreateOptions: RoomCreateOptions = {
      // Support for MSC3784.
      creation_content: {
        type: POLICY_ROOM_TYPE,
      },
      preset: 'public_chat',
      invite,
      initial_state: [
        {
          type: SHORTCODE_EVENT_TYPE,
          state_key: '',
          content: { shortcode: shortcode },
        },
      ],
      power_level_content_override: powerLevels,
      ...createRoomOptions,
    };
    // Guard room type in case someone overwrites it when declaring custom creation_content in future code.
    const roomType = finalRoomCreateOptions.creation_content?.type;
    if (
      typeof roomType !== 'string' ||
      !POLICY_ROOM_TYPE_VARIANTS.includes(roomType)
    ) {
      throw new TypeError(
        `Creating a policy room with a type other than the policy room type is not supported, you probably don't want to do this.`
      );
    }
    return await this.client.createRoom(finalRoomCreateOptions).then(
      (roomId) => Ok(new MatrixRoomID(roomId, [creator.domain])),
      (exception) =>
        ActionException.Result(
          'Could not create a matrix room to serve as the new policy list.',
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }
  getPolicyRuleEvents(
    room: MatrixRoomReference
  ): Promise<ActionResult<PolicyRuleEvent[]>> {
    return this.client.getRoomState(room.toRoomIdOrAlias()).then(
      (events) => Ok(events.filter(isPolicyRuleEvent)),
      (exception) =>
        ActionError.Result(
          `Could not fetch the room state for the policy list ${room.toPermalink()} and so we are unable to fetch any policy rules.`,
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }
  public async getListRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyListRevisionIssuer>> {
    const revisionIssuer = this.issuedLists.get(room.toRoomIdOrAlias());
    if (revisionIssuer === undefined) {
      // then intern the list
      const initialRevisionResult = await this.getInitialPolicyListRevision(
        room
      );
      if (isError(initialRevisionResult)) {
        return initialRevisionResult;
      }
      const issuer = new StandardPolicyListRevisionIssuer(
        room,
        initialRevisionResult.ok,
        this
      );
      // FIXME: there is potential for race if the same list is asked for in two places
      // very bad please fix with an await lock.
      // could also be fixed by populating with the blank revision first and then
      // revising it asynchrnously, but that would be bad too.
      // actually forget that, i don't think it'd work either because of event loop scheduling.
      this.issuedLists.set(room.toRoomIdOrAlias(), issuer);
      return Ok(issuer);
    } else {
      return Ok(revisionIssuer);
    }
  }
  private async getInitialPolicyListRevision(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyListRevision>> {
    const eventsResult = await this.getPolicyRuleEvents(room);
    if (isError(eventsResult)) {
      return eventsResult;
    }
    const revision = StandardPolicyListRevision.blankRevision(room).revise(
      eventsResult.ok
    );
    return Ok(revision);
  }
}
