// Minimal ambient declarations for the Web MIDI API.
// Avoids depending on @types/webmidi while still giving us solid types
// for the small surface area we use.

declare global {
  interface Navigator {
    requestMIDIAccess?: (
      options?: { sysex?: boolean; software?: boolean }
    ) => Promise<MIDIAccess>;
  }

  interface MIDIAccess extends EventTarget {
    readonly inputs: MIDIInputMap;
    readonly outputs: MIDIOutputMap;
    onstatechange: ((this: MIDIAccess, ev: MIDIConnectionEvent) => void) | null;
    readonly sysexEnabled: boolean;
  }

  // The W3C spec defines these as ES Maps; ReadonlyMap is the closest fit.
  type MIDIInputMap = ReadonlyMap<string, MIDIInput>;
  type MIDIOutputMap = ReadonlyMap<string, MIDIOutput>;

  type MIDIPortState = 'connected' | 'disconnected';
  type MIDIPortConnectionState = 'open' | 'closed' | 'pending';

  interface MIDIPort extends EventTarget {
    readonly id: string;
    readonly manufacturer: string | null;
    readonly name: string | null;
    readonly type: 'input' | 'output';
    readonly version: string | null;
    readonly state: MIDIPortState;
    readonly connection: MIDIPortConnectionState;
    onstatechange: ((this: MIDIPort, ev: MIDIConnectionEvent) => void) | null;
    open(): Promise<MIDIPort>;
    close(): Promise<MIDIPort>;
  }

  interface MIDIInput extends MIDIPort {
    readonly type: 'input';
    onmidimessage: ((this: MIDIInput, ev: MIDIMessageEvent) => void) | null;
  }

  interface MIDIOutput extends MIDIPort {
    readonly type: 'output';
    send(data: number[] | Uint8Array, timestamp?: number): void;
    clear(): void;
  }

  interface MIDIMessageEvent extends Event {
    readonly data: Uint8Array;
    readonly timeStamp: number;
  }

  interface MIDIConnectionEvent extends Event {
    readonly port: MIDIPort;
  }
}

export {};
