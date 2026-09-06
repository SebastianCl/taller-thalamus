# Garment source assets

The original shirt model and mask are independent and must not be regenerated
by `prepare-garments.mjs`.

## Hoodie

- File: `ladieshoodiedown1.obj`
- Asset: `elvs_hooded_sweat_jacket1`
- Author: Elvaerwyn
- License: CC-BY, exactly as declared in the source OBJ and asset pack.
- Source: https://static.makehumancommunity.org/assets/assetpacks/shirts02.html
- Download: https://files2.makehumancommunity.org/asset_packs/shirts02/shirts02_ccby.zip
- Original asset page: https://www.makehumancommunity.org/node/1450

This is a fitted hoodie with the hood down. It has no separate pocket or collar;
the editor exposes only parts actually represented by its geometry.

## Camibuso

- File: `sweater_fisherman.obj`
- Asset: `toigo_fisherman_sweater`
- Author: MargaretToigo (MRT in the OBJ header)
- License: CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
- Source: https://static.makehumancommunity.org/assets/assetpacks/shirts01.html
- Download: https://files2.makehumancommunity.org/asset_packs/shirts01/shirts01_cc0.zip
- Original asset page: https://www.makehumancommunity.org/node/1187

The crew-neck, long-sleeve geometry is used with a plain fabric material.
Original knitted graphics are not included.

## Preparation

Run `node scripts/prepare-garments.mjs` with the project's installed dependencies.
It generates only the two new GLBs, their independent UV masks, audits and
`lib/garment-manifests.json`. Original graphics are removed; normals are preserved
and interpolated at straight zone boundaries, the geometry is indexed and scaled,
and every editable part is assigned a separate region of a 4K UV mask. Source OBJ
files retain their author/license headers. Credits also ship with exported designs.

The user-suggested Sketchfab models were checked using the official public API on
2026-09-06. Both were listed as downloadable under CC BY 4.0, but the official
download endpoint returned HTTP 401 without a Sketchfab account session. These
MakeHuman alternatives are used instead; they are not those Sketchfab assets.
