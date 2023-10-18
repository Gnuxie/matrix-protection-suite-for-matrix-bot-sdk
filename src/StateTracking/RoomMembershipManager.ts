/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionError,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  InternedInstanceFactory,
  Logger,
  MatrixRoomID,
  Ok,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  StandardRoomMembershipRevision,
  StringRoomID,
  Value,
  isError,
} from 'matrix-protection-suite';
import { StaticDecode } from '@sinclair/typebox';
import { MembershipEvent } from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import { StandardRoomMembershipRevisionIssuer } from 'matrix-protection-suite';

const log = new Logger('BotSDKRoomMembershipManager');

export class BotSDKRoomMembershipManager implements RoomMembershipManager {
  private readonly roomMembershipIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomMembershipRevisionIssuer,
    [MatrixRoomID]
  >;

  public constructor(private readonly client: MatrixSendClient) {
    this.roomMembershipIssuers = new InternedInstanceFactory(
      async (_roomID, room) => {
        const membersResult = await this.getRoomMembershipEvents(room);
        if (isError(membersResult)) {
          return membersResult;
        }
        // we need to make the revision issuer but it's blank atm.
        const revision = StandardRoomMembershipRevision.blankRevision(
          room
        ).reviseFromMembership(membersResult.ok);
        return Ok(
          new StandardRoomMembershipRevisionIssuer(room, revision, this)
        );
      }
    );
  }

  getRoomMembershipRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>> {
    return this.roomMembershipIssuers.getInstance(room.toRoomIdOrAlias(), room);
  }
  public async getRoomMembershipEvents(
    room: MatrixRoomID
  ): Promise<ActionResult<StaticDecode<typeof MembershipEvent>[]>> {
    const rawMembersResult = await this.client
      .doRequest(
        'GET',
        `/_matrix/client/v3/rooms/${encodeURIComponent(
          room.toRoomIdOrAlias()
        )}/members`
      )
      .then(
        (ok) => Ok(ok),
        (exception) =>
          ActionException.Result(
            `Unable to query room members from ${room.toPermalink()}`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
    if (isError(rawMembersResult)) {
      return rawMembersResult;
    }
    if (
      !('chunk' in rawMembersResult.ok) ||
      !Array.isArray(rawMembersResult.ok['chunk'])
    ) {
      const message = `Unable parse the result of a /members query in ${room.toPermalink()}`;
      log.error(message, rawMembersResult);
      return ActionError.Result(message);
    }
    const members: StaticDecode<typeof MembershipEvent>[] = [];
    for (const rawEvent of rawMembersResult.ok['chunk']) {
      const memberResult = Value.Decode(MembershipEvent, rawEvent);
      if (isError(memberResult)) {
        log.error(
          `Unable to parse the event ${rawEvent.event_id} from ${rawEvent.room_id}`,
          JSON.stringify(rawEvent),
          memberResult.error
        );
        continue;
      }
      members.push(memberResult.ok);
    }
    return Ok(members);
  }
}
