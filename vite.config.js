import { defineConfig } from 'vite';

// The project uses relative static assets and does not need symlink realpath resolution.
// Keeping this disabled avoids Vite's Windows network-drive probe during local builds.
export default defineConfig({
    resolve: {
        preserveSymlinks: true,
    },
});
