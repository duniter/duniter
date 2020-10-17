import { EventEmitter } from 'events';
import { RustEventEmitter as RustEventEmitterInner } from '../native';

export class RustEventEmitter extends EventEmitter {

    isShutdown: boolean;

    constructor() {
      super();
  
      // Create an instance of the Neon class
      const channel = new RustEventEmitterInner();

      // Marks the emitter as shutdown to stop iteration of the `poll` loop
      this.isShutdown = false;
  
      // The `loop` method is called continuously to receive data from the Rust
      // work thread.
      const loop = async () => {
        // Stop the receiving loop and shutdown the work thead. However, since
        // the `poll` method uses a blocking `recv`, this code will not execute
        // until either the next event is sent on the channel or a receive
        // timeout has occurred.
        if (this.isShutdown) {
          return;
        }

        await new Promise((res, rej) => setTimeout(() => res(), 100));
  
        // Poll for data
        channel.poll((err, e) => {
          if (err) this.emit('error', err);
          else if (e) {
            //console.log("TMP: js receive event from rust");
            const { event, ...data } = e;
  
            // Emit the event
            this.emit(event, data);
          }
  
          // Schedule the next iteration of the loop. This is performed with
          // a `setImmediate` to yield to the event loop, to let JS code run
          // and avoid a stack overflow.
          setImmediate(loop);
        });
      };
  
      // Start the polling loop on next iteration of the JS event loop to prevent zalgo.
      setImmediate(loop);
    }
  
    // Mark the channel for shutdown
    shutdown() {
      this.isShutdown = true;
      return this;
    }
  }

