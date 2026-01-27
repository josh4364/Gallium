# Exit on error
set -e

echo "Killing existing Gallium processes..."
pkill -f gallium-server || true
pkill -f gallium-tui || true

echo "Starting Gallium build process..."

# Create build directory if it doesn't exist
mkdir -p build
cd build

# Run CMake configuration
echo "Configuring with CMake..."
cmake ..

# Run Make
echo "Building project..."
make -j$(nproc)

echo "Build complete!"
echo "Server binary: build/bin/server/gallium-server"
echo "Client binary: build/bin/client/gallium-tui"
