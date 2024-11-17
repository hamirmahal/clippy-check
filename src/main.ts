import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";

import { CheckRunner } from "./check";
import * as input from "./input";

const Cargo = {
    get: async () => {
        return {
            call: async (args: string[], options: exec.ExecOptions) => {
                return await exec.exec("cargo", args, options);
            },
        };
    },
};

const Cross = {
    getOrInstall: async () => {
        const program = await Cargo.get();
        let version = "";
        await program.call(["-V"], {
            silent: true,
            listeners: {
                stdout: (buffer: Buffer) =>
                    (version = buffer.toString().trim()),
            },
        });
        if (version.includes("cross")) {
            return program;
        }

        await program.call(["install", "cross"], {
            silent: true,
        });

        return Cargo.get();
    },
};

export async function run(actionInput: input.Input): Promise<void> {
    const startedAt = new Date().toISOString();

    let program: {
        call: (args: string[], options: exec.ExecOptions) => Promise<number>;
    };
    if (actionInput.useCross) {
        program = await Cross.getOrInstall();
    } else {
        program = await Cargo.get();
    }

    // TODO: Simplify this block
    let rustcVersion = "";
    let cargoVersion = "";
    let clippyVersion = "";
    await exec.exec("rustc", ["-V"], {
        silent: true,
        listeners: {
            stdout: (buffer: Buffer) =>
                (rustcVersion = buffer.toString().trim()),
        },
    });
    await program.call(["-V"], {
        silent: true,
        listeners: {
            stdout: (buffer: Buffer) =>
                (cargoVersion = buffer.toString().trim()),
        },
    });
    await program.call(["clippy", "-V"], {
        silent: true,
        listeners: {
            stdout: (buffer: Buffer) =>
                (clippyVersion = buffer.toString().trim()),
        },
    });

    let args: string[] = [];
    // Toolchain selection MUST go first in any condition
    if (actionInput.toolchain) {
        args.push(`+${actionInput.toolchain}`);
    }
    args.push("clippy");
    // `--message-format=json` should just right after the `cargo clippy`
    // because usually people are adding the `-- -D warnings` at the end
    // of arguments and it will mess up the output.
    args.push("--message-format=json");

    args = args.concat(actionInput.args);

    const runner = new CheckRunner();
    let clippyExitCode = 0;
    try {
        core.startGroup("Executing cargo clippy (JSON output)");
        clippyExitCode = await program.call(args, {
            ignoreReturnCode: true,
            failOnStdErr: false,
            listeners: {
                stdline: (line: string) => {
                    runner.tryPush(line);
                },
            },
        });
    } finally {
        core.endGroup();
    }

    let sha = github.context.sha;
    if (github.context.payload.pull_request?.head?.sha) {
        sha = github.context.payload.pull_request.head.sha;
    }

    await runner.executeCheck({
        token: actionInput.token,
        name: actionInput.name,
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        head_sha: sha,
        started_at: startedAt,
        context: {
            rustc: rustcVersion,
            cargo: cargoVersion,
            clippy: clippyVersion,
        },
    });

    if (clippyExitCode !== 0) {
        throw new Error(
            `Clippy had exited with the ${clippyExitCode} exit code`
        );
    }
}

async function main(): Promise<void> {
    try {
        const actionInput = input.get();

        await run(actionInput);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed(String(error));
        }
    }
}

main();
