// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ClientsInRoomMap,
  RoomCreator,
  RoomJoiner,
  StringUserID,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';
import { BotSDKAllClient } from '../Client/BotSDKAllClient';

/**
 * Creates client capabilities that reference a ClientsInRoomMap so that
 * the joined rooms can be preempted consistently.
 */
export class ClientCapabilityFactory {
  public constructor(private readonly clientsInRoomMap: ClientsInRoomMap) {
    // nothing to do.
  }

  public makeAll(
    clientUserID: StringUserID,
    client: MatrixSendClient
  ): RoomJoiner & RoomCreator {
    const clientRooms = this.clientsInRoomMap.getClientRooms(clientUserID);
    if (clientRooms === undefined) {
      throw new TypeError(
        `Cannot create a client for an untracked user ${clientUserID}`
      );
    }
    return new BotSDKAllClient(client, clientRooms);
  }
}
