* This development platform is hosted on NixOS and a development flake is used for all dependicy gathering.
* The flake is located at `./flake.nix`
* Enter the nix develop shell with `nix develop --command`
* You can build the project with `nix develop --command ./build.sh`
* To run the client: `nix develop --command ./build/bin/client/gallium-tui`
* To run the server: `nix develop --command ./build/bin/server/gallium-server`
