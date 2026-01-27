{
  description = "Gallium: A high-performance AI workflow system";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Build tools
            cmake
            gcc
            pkg-config
            gnumake

            # Project dependencies
            notcurses
            sqlite
            libwebsockets
            curl
            json_c
            
            # Development utilities
            gdb
            valgrind
            python3 # For potential scripting or MCP tests
          ];

          shellHook = ''
            echo "Entering Gallium development environment..."
            echo "Available tools: cmake, gcc, notcurses, sqlite, libwebsockets"
            export PS1="[gallium-dev] \w \$ "
          '';
        };
      }
    );
}
