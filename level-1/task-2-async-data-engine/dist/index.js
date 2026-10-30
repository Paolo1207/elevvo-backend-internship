"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("./engine");
async function main() {
    const threadpool = process.env.UV_THREADPOOL_SIZE ?? '(not set, Node default is 4)';
    console.log(`UV_THREADPOOL_SIZE = ${threadpool}`);
    console.log('Querying all sources at the same time...\n');
    const result = await (0, engine_1.runDataEngine)({ simulateFailures: true });
    const completedTodos = result.todos.filter((todo) => todo.completed).length;
    console.log('\n--- Results ---');
    console.log(`Users loaded : ${result.users.length}`);
    console.log(`Posts loaded : ${result.posts.length}`);
    console.log(`Todos loaded : ${result.todos.length} (${completedTodos} completed)`);
    const firstUser = result.users[0];
    if (firstUser !== undefined) {
        console.log('\nFirst user:', firstUser);
    }
    if (result.errors.length > 0) {
        console.log(`\n${result.errors.length} source(s) failed, errors were isolated:`);
        for (const error of result.errors) {
            console.log(` - ${error.source}: ${error.message}`);
        }
    }
    console.log(`\nFinished in ${result.durationMs.toFixed(0)} ms`);
}
main().catch((error) => {
    console.error('Unexpected fatal error:', error);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map