{
  description = "Gallium - AI Workflow System";

  inputs = {
    nixpkgs.url = "nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell.override { stdenv = pkgs.stdenv; } {
          nativeBuildInputs = with pkgs; [
            cmake
            pkg-config
            fd
            ripgrep
          ];
          buildInputs = with pkgs; [
            notcurses
            ncurses
            sqlite
            libwebsockets
            json_c
            openssl
            zlib
            curl
            libnotify
            gdk-pixbuf
            glib
            libqalculate
            (pkgs.python312.withPackages (ps: with ps; [
                google-genai
                aiohttp
                requests
            ]))
          ];

          shellHook = ''
            echo "Gallium Development Environment"
            export PS1="[gallium-dev] \w $ "
          '';
        };
      }
    );
}
