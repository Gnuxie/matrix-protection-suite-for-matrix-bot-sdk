/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import {
  PersistentMatrixData,
  MjolnirProtectedRoomsEvent,
  ActionResult,
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
  ActionException,
  ActionExceptionKind,
  Value,
  isError,
  Ok,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';

export class BotSDKMjolnirProtectedRoomsStore
  implements PersistentMatrixData<typeof MjolnirProtectedRoomsEvent>
{
  constructor(private readonly client: MatrixSendClient) {
    // nothing to do.
  }
  public requestPersistentData(): Promise<
    ActionResult<MjolnirProtectedRoomsEvent>
  > {
    return this.client.getAccountData(MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE).then(
      (value) => Value.Decode(MjolnirProtectedRoomsEvent, value),
      (exception) =>
        ActionException.Result(
          `Unable to load the account data for mjolnir protected_rooms`,
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }
  public async storePersistentData(
    data: MjolnirProtectedRoomsEvent
  ): Promise<ActionResult<void>> {
    const encodedData = Value.Encode(MjolnirProtectedRoomsEvent, data);
    if (isError(encodedData)) {
      return encodedData;
    }
    return this.client
      .setAccountData(MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE, encodedData.ok)
      .then(
        (_value) => Ok(undefined),
        (exception) =>
          ActionException.Result(
            `Unable to set account data for mjolnir protected_rooms event`,
            { exception, exceptionKind: ActionExceptionKind.Unknown }
          )
      );
  }
}
