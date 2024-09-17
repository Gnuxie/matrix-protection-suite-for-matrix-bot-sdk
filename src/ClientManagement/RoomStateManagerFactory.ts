/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  ActionError,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ClientsInRoomMap,
  EventDecoder,
  InternedInstanceFactory,
  Logger,
  MultipleErrors,
  Ok,
  PolicyRoomManager,
  PolicyRoomRevisionIssuer,
  PolicyRuleType,
  ResultError,
  RoomEvent,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  RoomStateBackingStore,
  RoomStateManager,
  RoomStateMembershipRevisionIssuer,
  RoomStatePolicyRoomRevisionIssuer,
  RoomStateRevisionIssuer,
  StandardPolicyRoomRevision,
  StandardRoomMembershipRevision,
  StandardRoomStateRevisionIssuer,
  StateEvent,
  isError,
  isOk,
} from 'matrix-protection-suite';
import { ClientForUserID } from './ClientManagement';
import { MatrixSendClient } from '../MatrixEmitter';
import { BotSDKRoomMembershipManager } from '../StateTracking/RoomMembershipManager';
import { BotSDKPolicyRoomManager } from '../PolicyList/PolicyListManager';
import { Redaction } from 'matrix-protection-suite/dist/MatrixTypes/Redaction';
import { BotSDKClientPlatform } from '../Client/BotSDKClientPlatform';
import { BotSDKBaseClient } from '../Client/BotSDKBaseClient';
import {
  StringRoomID,
  MatrixRoomID,
  StringUserID,
} from '@the-draupnir-project/matrix-basic-types';

const log = new Logger('RoomStateManagerFactory');

export class RoomStateManagerFactory {
  private readonly roomStateIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomStateRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const getInitialRoomState = async () => {
      if (this.roomStateBackingStore !== undefined) {
        const storeResult = await this.roomStateBackingStore.getRoomState(
          room.toRoomIDOrAlias()
        );
        if (isOk(storeResult)) {
          if (storeResult.ok !== undefined) {
            return Ok(storeResult.ok);
          }
        } else {
          log.error(
            `Could not load room state from the backing store`,
            storeResult.error
          );
        }
      }
      return await this.getRoomStateForRevisionIssuer(room);
    };
    const stateResult = await getInitialRoomState();
    // TODO: This entire class needs moving the MPS main via client capabilities.
    //       so that it can be unit tested.
    if (isError(stateResult)) {
      return stateResult;
    }
    const issuer = new StandardRoomStateRevisionIssuer(
      room,
      this.getRoomStateForRevisionIssuer,
      stateResult.ok
    );
    if (this.roomStateBackingStore) {
      issuer.on('revision', this.roomStateBackingStore.revisionListener);
    }
    return Ok(issuer);
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
        StandardPolicyRoomRevision.blankRevision(room),
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
    private readonly eventDecoder: EventDecoder,
    private readonly roomStateBackingStore?: RoomStateBackingStore
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
    const chosenClientUserID = managedClientsInRoom[0];
    if (chosenClientUserID === undefined) {
      return ActionError.Result(
        `There is no managed client in the room ${room.toPermalink()} and so we cannot fetch the room state there.`
      );
    }
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
    const clientRooms = this.clientsInRoomMap.getClientRooms(clientUserID);
    if (clientRooms === undefined) {
      throw new TypeError(`Cannot find clientRooms for ${clientUserID}`);
    }
    // FIXME: Shouldn't we have an equivalent of the clientProvider that
    // gives us a clientPlatform? or one that gives both the platform and the client?
    return new BotSDKPolicyRoomManager(
      clientUserID,
      client,
      new BotSDKClientPlatform(
        new BotSDKBaseClient(
          client,
          clientUserID,
          clientRooms,
          this.eventDecoder
        )
      ),
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
