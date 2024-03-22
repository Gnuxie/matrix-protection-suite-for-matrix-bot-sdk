/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 */

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  MatrixAccountData,
  MatrixStateData,
  Ok,
  RoomStateRevisionIssuer,
  Value,
  isError,
} from 'matrix-protection-suite';
import { MatrixSendClient } from '../MatrixEmitter';

function is404(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    error.statusCode === 404
  );
}

export class BotSDKMatrixAccountData<T> implements MatrixAccountData<T> {
  constructor(
    private readonly eventType: string,
    private readonly eventSchema: Parameters<(typeof Value)['Decode']>[0],
    private readonly client: MatrixSendClient
  ) {
    // nothing to do.
  }
  public async requestAccountData(): Promise<ActionResult<T | undefined>> {
    return await this.client.getAccountData(this.eventType).then(
      (data) => Value.Decode(this.eventSchema, data),
      (error) =>
        is404(error)
          ? Ok(undefined)
          : ActionException.Result(
              `Encountered an error when requesting matrix account data ${this.eventType}`,
              { exception: error, exceptionKind: ActionExceptionKind.Unknown }
            )
    );
  }
  public async storeAccountData(data: T): Promise<ActionResult<void>> {
    const encodeResult = Value.Encode(this.eventSchema, data);
    if (isError(encodeResult)) {
      return encodeResult;
    }
    return await this.client
      .setAccountData(this.eventType, encodeResult.ok)
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to store matrix account data ${this.eventType}`,
            {
              exception,
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }
}

export class BotSDKMatrixStateData<T> implements MatrixStateData<T> {
  constructor(
    private readonly eventType: string,
    private readonly roomStateRevisionIssuer: RoomStateRevisionIssuer,
    private readonly client: MatrixSendClient
  ) {
    // nothing to do.
  }
  public requestStateContent(state_key: string): T | undefined {
    const event = this.roomStateRevisionIssuer.currentRevision.getStateEvent(
      this.eventType,
      state_key
    );
    return event?.content as T | undefined;
  }
  public async storeStateContent(
    state_key: string,
    content: T
  ): Promise<ActionResult<void>> {
    return await this.client
      .sendStateEvent(
        this.roomStateRevisionIssuer.room.toRoomIDOrAlias(),
        this.eventType,
        state_key,
        content
      )
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to store the matrix state data ${this.eventType}`,
            {
              exception,
              exceptionKind: ActionExceptionKind.Known,
            }
          )
      );
  }
}
