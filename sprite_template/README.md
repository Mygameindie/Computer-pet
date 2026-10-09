# Ragdoll sprite template

Files
- `ragdoll_template_guide.png`: the labelled guide (look at it; don't draw on it).
- `ragdoll_template_outlines.png`: transparent outlines + joint dots. Put it on the top layer in your art app, draw underneath, hide it before exporting.

Rules
- Canvas is always **851 x 1134 px**, transparent, same as `base.png`.
- Draw the character in the same standing pose (arms out, legs apart).
- **One PNG per part**, each on the full canvas, in the pose shown. Do not crop.
- Make the ends round and let them reach past the joint (the red dots) so there is no gap when the part bends.
- Parts overlap at the joints on purpose.

Parts (name each file `<part>.png`, add `_2` for character 2, e.g. `head_2.png`)

| Part | Contents | Rotates around |
|---|---|---|
| `back_wings` | wings (draw them whole, even where the body would hide them) | neck / shoulders |
| `back_tail` | tail | pelvis |
| `back_hair` | hair behind the head | neck |
| `thigh_L`, `thigh_R` | upper leg | hip |
| `shin_L`, `shin_R` | lower leg + foot | knee |
| `body` | torso + pelvis (no arms, legs or head) | neck |
| `upperarm_L`, `upperarm_R` | shoulder to elbow | shoulder |
| `forearm_L`, `forearm_R` | elbow to hand | elbow |
| `head` | head, face, front hair, ears / horns | neck |

Draw order, back to front: back_hair, back_wings, back_tail, thighs, shins, body, upper arms, forearms, head.

Left / right are the character's own left and right, as seen from the front: the **L** parts are on the viewer's left in the template picture.
