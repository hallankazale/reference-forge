from __future__ import annotations

from pathlib import Path

from .models import VehicleSpec


SCRIPT_TEMPLATE = '''import bpy
from pathlib import Path

PROJECT = Path(r"{project_dir}")
LENGTH_MM = {length_mm}
WIDTH_MM = {width_mm}
HEIGHT_MM = {height_mm}
WHEELBASE_MM = {wheelbase_mm}

# Trabalha em milímetros para facilitar escala física de miniaturas.
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'MILLIMETERS'
scene.unit_settings.scale_length = 0.001

# Limpa apenas o cubo padrão quando ele existir; não destrói outros assets.
obj = bpy.data.objects.get('Cube')
if obj:
    bpy.data.objects.remove(obj, do_unlink=True)

# Caixa-guia com as dimensões externas do veículo.
bpy.ops.mesh.primitive_cube_add(location=(0, 0, HEIGHT_MM / 2000.0))
body = bpy.context.object
body.name = 'VEHICLE_GUIDE'
body.dimensions = (
    LENGTH_MM / 1000.0,
    WIDTH_MM / 1000.0,
    HEIGHT_MM / 1000.0,
)
body.display_type = 'WIRE'
body.hide_render = True

# Marcadores simples dos eixos para conferência do entre-eixos.
for x in (-WHEELBASE_MM / 2000.0, WHEELBASE_MM / 2000.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.32, depth=WIDTH_MM / 1000.0, location=(x, 0, 0.32), rotation=(1.57079632679, 0, 0))
    wheel = bpy.context.object
    wheel.name = 'AXLE_GUIDE'
    wheel.display_type = 'WIRE'
    wheel.hide_render = True

blend_path = PROJECT / 'blender' / '{slug}.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
print(f'Reference Forge: projeto salvo em {{blend_path}}')
'''


def write_blender_setup(project_dir: Path, spec: VehicleSpec) -> Path:
    """Gera script idempotente de preparação inicial do Blender."""
    required = [spec.length_mm, spec.width_mm, spec.height_mm, spec.wheelbase_mm]
    if any(value is None or value <= 0 for value in required):
        raise ValueError("Comprimento, largura, altura e entre-eixos devem ser positivos.")

    script_path = project_dir / "blender" / "setup_reference_forge.py"
    script_path.write_text(
        SCRIPT_TEMPLATE.format(
            project_dir=project_dir.resolve(),
            slug=spec.slug,
            length_mm=spec.length_mm,
            width_mm=spec.width_mm,
            height_mm=spec.height_mm,
            wheelbase_mm=spec.wheelbase_mm,
        ),
        encoding="utf-8",
    )
    return script_path
