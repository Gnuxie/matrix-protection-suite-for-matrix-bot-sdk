// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ClientPlatform,
  RoomCreator,
  RoomJoiner,
  RoomResolver,
  RoomStateEventSender,
} from 'matrix-protection-suite';
import { BotSDKBaseClient } from './BotSDKBaseClient';

export class BotSDKClientPlatform implements ClientPlatform {
  constructor(private readonly allClient: BotSDKBaseClient) {
    // nothing to do,
  }
  toRoomCreator(): RoomCreator {
    return this.allClient;
  }
  toRoomJoiner(): RoomJoiner {
    return this.allClient;
  }
  toRoomResolver(): RoomResolver {
    return this.allClient;
  }
  toRoomStateEventSender(): RoomStateEventSender {
    return this.allClient;
  }
}
