/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ALL_RULE_TYPES,
  ActionError,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ClientsInRoomMap,
  EventDecoder,
  InternedInstanceFactory,
  Logger,
  MatrixRoomID,
  MultipleErrors,
  Ok,
  PolicyRoomManager,
  PolicyRoomRevisionIssuer,
  PolicyRuleType,
  ResultError,
  RoomEvent,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  RoomStateManager,
  RoomStateMembershipRevisionIssuer,
  RoomStatePolicyRoomRevisionIssuer,
  RoomStateRevisionIssuer,
  StandardPolicyRoomRevision,
  StandardRoomMembershipRevision,
  StandardRoomStateRevisionIssuer,
  StateEvent,
  StringRoomID,
  StringUserID,
  isError,
} from 'matrix-protection-suite';
import { ClientForUserID } from './ClientManagement';
import { MatrixSendClient } from '../MatrixEmitter';
import { BotSDKRoomMembershipManager } from '../StateTracking/RoomMembershipManager';
import { BotSDKPolicyRoomManager } from '../PolicyList/PolicyListManager';
import { Redaction } from 'matrix-protection-suite/dist/MatrixTypes/Redaction';

const log = new Logger('RoomStateManagerFactory');

export class RoomStateManagerFactory {
  private readonly roomStateIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomStateRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const stateResult = await this.getRoomStateForRevisionIssuer(room);
    // TODO: This entire class needs moving the MPS main via client capabilities.
    //       so that it can be unit tested.
    if (isError(stateResult)) {
      return stateResult;
    }
    return Ok(
      new StandardRoomStateRevisionIssuer(
        room,
        this.getRoomStateForRevisionIssuer,
        stateResult.ok
      )
    );
  });

  private readonly getRoomStateForRevisionIssuer =
    this.getRoomStateForRevisionIssuerMethod.bind(this);

  private readonly policyRoomIssuers: InternedInstanceFactory<
    StringRoomID,
    PolicyRoomRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_key, room) => {
    const roomStateIssuer = await this.roomStateIssuers.getInstance(
      room.toRoomIDOrAlias(),
      room
    );
    if (isError(roomStateIssuer)) {
      return roomStateIssuer;
    }
    return Ok(
      new RoomStatePolicyRoomRevisionIssuer(
        room,
        StandardPolicyRoomRevision.blankRevision(room).reviseFromState(
          roomStateIssuer.ok.currentRevision.getStateEventsOfTypes(
            ALL_RULE_TYPES
          )
        ),
        roomStateIssuer.ok
      )
    );
  });

  private readonly roomMembershipIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomMembershipRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const stateIssuer = await this.roomStateIssuers.getInstance(
      room.toRoomIDOrAlias(),
      room
    );
    if (isError(stateIssuer)) {
      return stateIssuer;
    }
    return Ok(
      new RoomStateMembershipRevisionIssuer(
        room,
        StandardRoomMembershipRevision.blankRevision(room).reviseFromMembership(
          stateIssuer.ok.currentRevision.getStateEventsOfType('m.room.member')
        ),
        stateIssuer.ok
      )
    );
  });

  constructor(
    public readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly clientProvider: ClientForUserID,
    private readonly eventDecoder: EventDecoder
  ) {
    // nothing to do.
  }

  public static async getRoomRoomState(
    client: MatrixSendClient,
    eventDecoder: EventDecoder,
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    const decodeResults = await client
      .getRoomState(room.toRoomIDOrAlias())
      .then(
        (events) =>
          Ok(events.map((event) => eventDecoder.decodeStateEvent(event))),
        (exception: unknown) =>
          ActionError.Result(
            `Could not fetch the room state for the room ${room.toPermalink()}.`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
    if (isError(decodeResults)) {
      return decodeResults;
    }
    const errors: ActionError[] = [];
    const events: StateEvent[] = [];
    for (const result of decodeResults.ok) {
      if (isError(result)) {
        errors.push(result.error);
      } else {
        events.push(result.ok);
      }
    }
    if (errors.length > 0) {
      log.error(
        `There were multiple errors while decoding state events for ${room.toPermalink()}`,
        MultipleErrors.Result(
          `Unable to decode state events in ${room.toPermalink()}`,
          { errors }
        )
      );
    }
    return Ok(events);
  }

  public async getRoomState(
    client: MatrixSendClient,
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    return await RoomStateManagerFactory.getRoomRoomState(
      client,
      this.eventDecoder,
      room
    );
  }

  private async getRoomStateForRevisionIssuerMethod(
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    const managedClientsInRoom = this.clientsInRoomMap.getManagedUsersInRoom(
      room.toRoomIDOrAlias()
    );
    if (managedClientsInRoom.length === 0) {
      return ActionError.Result(
        `There is no managed client in the room ${room.toPermalink()} and so we cannot fetch the room state there.`
      );
    }
    const chosenClientUserID = managedClientsInRoom[0];
    const client = await this.clientProvider(chosenClientUserID);
    return await RoomStateManagerFactory.getRoomRoomState(
      client,
      this.eventDecoder,
      room
    );
  }

  private requestingUserNotJoined(
    clientUserID: StringUserID,
    room: MatrixRoomID
  ): ActionException {
    const message = `The user ${clientUserID} is not joined to the room ${room.toPermalink()}`;
    return new ActionException(
      ActionExceptionKind.Unknown,
      new Error(message),
      message
    );
  }

  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (
      this.clientsInRoomMap.isClientPreemptivelyInRoom(clientUserID, roomID)
    ) {
      return await this.roomStateIssuers.getInstance(
        room.toRoomIDOrAlias(),
        room
      );
    } else {
      return ResultError(this.requestingUserNotJoined(clientUserID, room));
    }
  }

  public async getRoomStateManager(
    clientUserID: StringUserID
  ): Promise<RoomStateManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKRoomStateManager(clientUserID, client, this);
  }

  public async getPolicyRoomRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (
      this.clientsInRoomMap.isClientPreemptivelyInRoom(clientUserID, roomID)
    ) {
      return await this.policyRoomIssuers.getInstance(roomID, room);
    } else {
      return ResultError(this.requestingUserNotJoined(clientUserID, room));
    }
  }

  public getEditablePolicyRoomIDs(
    editor: StringUserID,
    ruleType: PolicyRuleType
  ): MatrixRoomID[] {
    const editableRoomIDs = this.policyRoomIssuers
      .allInstances()
      .filter((issuer) => issuer.currentRevision.isAbleToEdit(editor, ruleType))
      .map((issuer) => issuer.currentRevision.room);
    return editableRoomIDs;
  }

  public async getPolicyRoomManager(
    clientUserID: StringUserID
  ): Promise<PolicyRoomManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKPolicyRoomManager(
      clientUserID,
      client,
      this,
      this.clientsInRoomMap
    );
  }

  public async getRoomMembershipRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (
      this.clientsInRoomMap.isClientPreemptivelyInRoom(clientUserID, roomID)
    ) {
      return await this.roomMembershipIssuers.getInstance(roomID, room);
    } else {
      return ResultError(this.requestingUserNotJoined(clientUserID, room));
    }
  }

  public async getRoomMembershipManager(
    clientUserID: StringUserID
  ): Promise<RoomMembershipManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKRoomMembershipManager(clientUserID, client, this);
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (
      this.roomStateIssuers.hasInstance(roomID) &&
      ('state_key' in event || event.type === 'm.room.redaction')
    ) {
      const issuer = this.roomStateIssuers.getStoredInstance(roomID);
      if (issuer === undefined) {
        throw new TypeError(
          'Somehow the has method for the interned instances is lying or the code is wrong'
        );
      }
      if (event.type === 'm.room.redaction') {
        issuer.updateForRedaction(event as Redaction);
      } else {
        issuer.updateForEvent(event as StateEvent);
      }
    }
  }
}

class BotSDKRoomStateManager implements RoomStateManager {
  public constructor(
    public readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly factory: RoomStateManagerFactory
  ) {
    // nothing to do.
  }
  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    return await this.factory.getRoomStateRevisionIssuer(
      room,
      this.clientUserID
    );
  }
  public async getRoomState(
    room: MatrixRoomID
  ): Promise<ActionResult<StateEvent[]>> {
    return await this.factory.getRoomState(this.client, room);
  }
}
