<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added

- Support for Synapse admin endpoint for querying the block status of
  a room

- Synapse admin endpoint for shutdown V2

- Synapse admin endpoint for room details.

### Changed

- Support for MPS's new SHA256HashReverser in the `RoomStateManagerFactory`.

## [2.10.1] - 2025-03-03

### Fixed

- Logging of unknown request errors has been improved.

## [2.6.0] - 2025-01-24

### Added

- Room state will automatically refresh in the
  `RoomStateManagerFactory` when the backing store is used.

- Implemented `RoomStateGetter` capability from MPS 2.6.0.

## [2.5.2] - 2025-01-18

### Fixed

- Fix an issue where the implementation of the RoomUnbanner capability
  was actually calling `/ban`.

## [2.5.0] - 2025-01-12

### Added

- Implemented `RoomInviter` on MPS's `ClientPlatform`.

## [2.4.0] - 2025-01-10

### Added

- `SynapseAdminClient['getAbuseReports']`.

## [2.3.2] - 2025-01-09

### Fixed

- Typo in room resolvation code LwL.

## [2.3.1] - 2025-01-09

### Fixed

- Resolving room aliases now takes the via servers from the server
  response
  https://spec.matrix.org/v1.10/client-server-api/#get_matrixclientv3directoryroomroomalias

## [1.5.0] - 2024-10-01

### Changed

- MPS `v1.5.0`.

### Added

- Implementation for `PersistentConfigBackend`.

## [1.4.0] - 2024-09-17

### Changed

- Skip calling `/join` if we already are joined with `RoomJoiner` and `ClientRooms`.
- Upgraded to matrix-protection-suite@1.4.0.

## [1.3.0] - 2024-09-11

### Changed

- Upgraded to matrix-protection-suite@1.3.0.

## [1.2.0] - 2024-09-09

### Changed

- Upgraded to matrix-protection-suite@1.2.0.

## [1.1.0] - 2024-08-26

### Changed

- Upgraded to matrix-protection-suite@1.1.0.
- Implemented `RoomMessageSender` on `ClientPlatform`.

## [1.0.0] - 2024-08-16

### Changed

- Upgraded to matrix-protection-suite@1.0.0.

## [0.24.0] - 2024-08-16

### Changed

- Upgraded to matrix-protection-suite@0.24.0

- Moved to @the-draupnir-project/matrix-basic-types.
