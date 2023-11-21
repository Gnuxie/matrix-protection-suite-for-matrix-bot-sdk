/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  EventDecoder,
  PolicyRoomManager,
  RoomMembershipManager,
  RoomStateManager,
  StateTrackingMeta,
} from 'matrix-protection-suite';
import { MatrixSendClient, SafeMatrixEmitter } from './MatrixEmitter';
import { BotSDKRoomStateManager } from './StateTracking/RoomStateManager';
import { BotSDKRoomStatePolicyRoomManager } from './PolicyList/PolicyListManager';
import { BotSDKRoomStateRoomMembershipManager } from './StateTracking/RoomMembershipManager';

export interface ManagerManager {
  readonly roomStateManager: RoomStateManager;
  readonly policyRoomManager: PolicyRoomManager;
  readonly roomMembershipManager: RoomMembershipManager;
}

export class ManagerManagerForMatrixEmitter implements ManagerManager {
  public readonly roomStateManager: RoomStateManager;
  public readonly policyRoomManager: PolicyRoomManager;
  public readonly roomMembershipManager: RoomMembershipManager;

  constructor(
    readonly matrixEmitter: SafeMatrixEmitter,
    trackingMeta: StateTrackingMeta,
    eventDecoder: EventDecoder,
    matrixClient: MatrixSendClient
  ) {
    this.roomStateManager = new BotSDKRoomStateManager(
      trackingMeta,
      eventDecoder,
      matrixClient
    );
    this.policyRoomManager = new BotSDKRoomStatePolicyRoomManager(
      matrixClient,
      this.roomStateManager
    );
    this.roomMembershipManager = new BotSDKRoomStateRoomMembershipManager(
      matrixClient,
      this.roomStateManager
    );
    matrixEmitter.on(
      'room.event',
      this.roomStateManager.handleTimelineEvent.bind(this.roomStateManager)
    );
  }
}
