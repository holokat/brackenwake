"""Dedicated background Blender Lab worker. Never contacts the GUI bridge."""
import bpy, importlib
bpy.ops.preferences.addon_enable(module='bl_ext.lab_blender_org.mcp')
addon=importlib.import_module('bl_ext.lab_blender_org.mcp')
prefs=bpy.context.preferences.addons['bl_ext.lab_blender_org.mcp'].preferences
prefs.timer_interval_active=min(prefs.timer_interval_active,.05)
prefs.timer_interval_idle=min(prefs.timer_interval_idle,.25)
server=addon.mcp_to_blender_server
server.start('127.0.0.1',9878)
print('CELLAR_DEPTH_BOSS_BRIDGE_READY',flush=True)
while server.is_running():server.poll_blocking(.25)
