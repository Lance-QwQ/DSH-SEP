/* Test-only persistent US keyboard; physical evdev codes, private compositor. */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <wayland-client.h>
#include "virtual-keyboard.h"
struct xkb_context;struct xkb_keymap;
struct xkb_rule_names {const char *rules,*model,*layout,*variant,*options;};
extern struct xkb_context *xkb_context_new(int flags);
extern struct xkb_keymap *xkb_keymap_new_from_names(struct xkb_context *,const struct xkb_rule_names *,int flags);
extern char *xkb_keymap_get_as_string(struct xkb_keymap *,int format);
extern void xkb_keymap_unref(struct xkb_keymap *);
extern void xkb_context_unref(struct xkb_context *);
static struct zwp_virtual_keyboard_manager_v1 *manager;static struct wl_seat *seat;
static void global(void *data,struct wl_registry *r,uint32_t name,const char *interface,uint32_t version){
 (void)data;
 if(!strcmp(interface,"zwp_virtual_keyboard_manager_v1"))manager=wl_registry_bind(r,name,&zwp_virtual_keyboard_manager_v1_interface,1);
 if(!strcmp(interface,"wl_seat"))seat=wl_registry_bind(r,name,&wl_seat_interface,version<7?version:7);
}
static void removed(void *data,struct wl_registry *r,uint32_t name){(void)data;(void)r;(void)name;}
static const struct wl_registry_listener listener={global,removed};
static uint32_t now(void){struct timespec ts;clock_gettime(CLOCK_MONOTONIC,&ts);return (uint32_t)(ts.tv_sec*1000+ts.tv_nsec/1000000);}
int main(void){
 const char *root=getenv("XDG_RUNTIME_DIR"),*display=getenv("WAYLAND_DISPLAY");struct stat st;
 if(!root||strncmp(root,"/opt/dsh-sep-cross-platform/alpha2-portable-wayland-",strlen("/opt/dsh-sep-cross-platform/alpha2-portable-wayland-"))||!display||strchr(display,'/')||lstat(root,&st)||!S_ISDIR(st.st_mode)||st.st_uid!=getuid()||(st.st_mode&0077))return 64;
 struct wl_display *d=wl_display_connect(NULL);if(!d)return 65;
 struct wl_registry *r=wl_display_get_registry(d);wl_registry_add_listener(r,&listener,NULL);if(wl_display_roundtrip(d)<0||!manager||!seat)return 66;
 struct xkb_context *ctx=xkb_context_new(0);struct xkb_rule_names names={.layout="us"};struct xkb_keymap *map=xkb_keymap_new_from_names(ctx,&names,0);if(!map)return 67;char *text=xkb_keymap_get_as_string(map,1);size_t size=strlen(text)+1;int fd=memfd_create("sep-test-keymap",MFD_CLOEXEC);if(fd<0||write(fd,text,size)!=(ssize_t)size)return 68;
 struct zwp_virtual_keyboard_v1 *k=zwp_virtual_keyboard_manager_v1_create_virtual_keyboard(manager,seat);zwp_virtual_keyboard_v1_keymap(k,1,fd,size);if(wl_display_roundtrip(d)<0)return 69;free(text);xkb_keymap_unref(map);xkb_context_unref(ctx);setvbuf(stdout,NULL,_IOLBF,0);puts("ready");
 char line[128];
 while(fgets(line,sizeof(line),stdin)){
  unsigned code,state;char extra;
  if(sscanf(line,"key %u %u %c",&code,&state,&extra)==2&&code>0&&code<128&&state<2)zwp_virtual_keyboard_v1_key(k,now(),code,state);
  else if(sscanf(line,"mods %u %c",&state,&extra)==1&&state<256)zwp_virtual_keyboard_v1_modifiers(k,state,0,0,0);
  else if(!strcmp(line,"reset\n")){zwp_virtual_keyboard_v1_keymap(k,1,fd,size);zwp_virtual_keyboard_v1_modifiers(k,0,0,0,0);}
  else if(!strcmp(line,"quit\n"))break;else return 70;
  if(wl_display_roundtrip(d)<0)return 71;
  puts("ok");
 }
 close(fd);zwp_virtual_keyboard_v1_modifiers(k,0,0,0,0);zwp_virtual_keyboard_v1_destroy(k);wl_registry_destroy(r);wl_display_flush(d);wl_display_disconnect(d);return 0;
}
