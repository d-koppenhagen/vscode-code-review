declare module 'stub-spawn-once';

declare function stubExecOnce(command: string, stdout: string): any;
declare function stubExecOnce(command: string, exit: number, stdout: string, stderr: string): any;
