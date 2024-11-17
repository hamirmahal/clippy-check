import stringArgv from "string-argv";

const input = {
    getInput: (name: string, options?: { required: boolean }): string => {
        const value =
            process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`];
        if (options?.required && !value) {
            throw new Error(`Input required and not supplied: ${name}`);
        }
        return value || "";
    },
    getInputBool: (name: string): boolean => {
        return input.getInput(name) === "true";
    },
};

// Parsed action input
export interface Input {
    token: string;
    toolchain?: string;
    args: string[];
    useCross: boolean;
    name: string;
}

export function get(): Input {
    const args = stringArgv(input.getInput("args"));
    let toolchain = input.getInput("toolchain");
    if (toolchain.startsWith("+")) {
        toolchain = toolchain.slice(1);
    }
    const useCross = input.getInputBool("use-cross");
    const name = input.getInput("name");

    return {
        token: input.getInput("token", { required: true }),
        args: args,
        useCross: useCross,
        toolchain: toolchain || undefined,
        name,
    };
}
