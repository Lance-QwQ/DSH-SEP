/* Test only. Native virtual-pointer client for one private headless compositor. */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/stat.h>
#include <unistd.h>
#include <wayland-client.h>
#include "virtual-pointer.h"
static struct zwlr_virtual_pointer_manager_v1 *manager;
static void global(void *data,struct wl_registry *r,uint32_t name,const char *interface,uint32_t version){
 (void)data;(void)version;
 if(!strcmp(interface,"zwlr_virtual_pointer_manager_v1"))manager=wl_registry_bind(r,name,&zwlr_virtual_pointer_manager_v1_interface,1);
}
static void removed(void *data,struct wl_registry *r,uint32_t name){(void)data;(void)r;(void)name;}
static const struct wl_registry_listener listener={global,removed};
static uint32_t now(void){struct timespec ts;clock_gettime(CLOCK_MONOTONIC,&ts);return (uint32_t)(ts.tv_sec*1000+ts.tv_nsec/1000000);}
int main(void){
 const char *root=getenv("XDG_RUNTIME_DIR"),*display=getenv("WAYLAND_DISPLAY");struct stat st;
 if(!root||strncmp(root,"/opt/dsh-sep-cross-platform/alpha2-portable-wayland-",strlen("/opt/dsh-sep-cross-platform/alpha2-portable-wayland-"))||!display||strchr(display,'/')||lstat(root,&st)||!S_ISDIR(st.st_mode)||st.st_uid!=getuid()||(st.st_mode&0077))return 64;
 struct wl_display *d=wl_display_connect(NULL);if(!d)return 65;
 struct wl_registry *r=wl_display_get_registry(d);wl_registry_add_listener(r,&listener,NULL);if(wl_display_roundtrip(d)<0||!manager)return 66;
 struct zwlr_virtual_pointer_v1 *p=zwlr_virtual_pointer_manager_v1_create_virtual_pointer(manager,NULL);if(wl_display_roundtrip(d)<0)return 67;setvbuf(stdout,NULL,_IOLBF,0);puts("ready");
 char line[128];int held=0;
 while(fgets(line,sizeof(line),stdin)){
  unsigned x,y;char extra;
  if(sscanf(line,"move %u %u %c",&x,&y,&extra)==2&&x<1600&&y<1000)zwlr_virtual_pointer_v1_motion_absolute(p,now(),x,y,1600,1000);
  else if(!strcmp(line,"down\n")&&!held){held=1;zwlr_virtual_pointer_v1_button(p,now(),272,1);}
  else if(!strcmp(line,"up\n")&&held){held=0;zwlr_virtual_pointer_v1_button(p,now(),272,0);}
  else if(!strcmp(line,"quit\n"))break;
  else return 68;
  zwlr_virtual_pointer_v1_frame(p);if(wl_display_roundtrip(d)<0)return 69;puts("ok");
 }
 if(held){zwlr_virtual_pointer_v1_button(p,now(),272,0);zwlr_virtual_pointer_v1_frame(p);wl_display_roundtrip(d);}
 zwlr_virtual_pointer_v1_destroy(p);zwlr_virtual_pointer_manager_v1_destroy(manager);wl_registry_destroy(r);wl_display_flush(d);wl_display_disconnect(d);return 0;
}
