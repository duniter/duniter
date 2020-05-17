#
#  The basic options we'll complete.
#
DUNITER_ARGUMENTS="config \
parse-logs \
wizard \
reset \
check-config \
export-bc \
reapply-to \
revert \
revert-to \
start \
stop \
restart \
status \
logs \
direct_start \
plug \
unplug \
gen-next \
bc-resolve \
gen-root \
gen-root-choose \
pub \
sec \
sync \
peer \
import \
sync-mempool \
sync-mempool-search \
sync-mempool-fwd \
pull \
forward \
import-lookup \
crawl-lookup \
fwd-pending-ms \
ws2p \
current \
trim-indexes \
dump \
search \
dump-ww \
webstart \
webrestart \
direct_webstart \
-h \
-V \
--home \
-d \
--autoconf \
--addep \
--remep \
--cpu \
--nb-cores \
--prefix \
-c \
--nostdout \
--noshuffle \
--nocheck-issuer \
--socks-proxy \
--tor-proxy \
--reaching-clear-ep \
--force-tor \
--rm-proxies \
--timeout \
--httplogs \
--nohttplogs \
--isolate \
--forksize \
--notrim \
--notrimc \
--memory \
--store-txs \
--store-ww \
--loglevel \
--sql-traces \
--show \
--check \
--submit-local \
--submit-host \
--submit-port \
--at \
--salt \
--passwd \
--keyN \
--keyr \
--keyp \
--keyprompt \
--keyfile \
--nointeractive \
--nocautious \
--cautious \
--nopeers \
--nop2p \
--localsync \
--nosources \
--nosbx \
--onlypeers \
--slow \
--readfilesystem \
--minsig \
--upnp \
--noupnp \
--bma \
--nobma \
--bma-with-crawler \
--bma-without-crawler \
-p \
--ipv4 \
--ipv6 \
--remoteh \
--remote4 \
--remote6 \
--remotep \
--ws2p-upnp \
--ws2p-noupnp \
--ws2p-host \
--ws2p-port \
--ws2p-remote-host \
--ws2p-remote-port \
--ws2p-remote-path \
--ws2p-max-private \
--ws2p-max-public \
--ws2p-private \
--ws2p-public \
--ws2p-noprivate \
--ws2p-nopublic \
--ws2p-sync \
--ws2p-nosync \
--ws2p-prefered-add \
--ws2p-prefered-rm \
--ws2p-prefered-only \
--ws2p-privileged-add \
--ws2p-privileged-rm \
--ws2p-privileged-only \
--webmhost \
--webmport
"

DUNITER_WIZARD_ARGS="key network network-reconfigure currency pow parameters"

DUNITER_RESET_ARGS="config data peers stats all"

DUNITER_WS2P_ARGS="list-prefered list-privileged list-nodes show-conf"

DUNITER_REACHING_CLEAR_EP_ARGS="clear tor none"

_duniter_completion()
{
    local cur prev base
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    #
    #  Complete the arguments to some of the basic commands.
    #
    case "${prev}" in
        wizard)
            COMPREPLY=( $(compgen -W "${DUNITER_WIZARD_ARGS}" -- ${cur}) )
            return 0
            ;;
        reset)
            COMPREPLY=( $(compgen -W "${DUNITER_RESET_ARGS}" -- ${cur}) )
            return 0
            ;;
        ws2p)
            COMPREPLY=( $(compgen -W "${DUNITER_WS2P_ARGS}" -- ${cur}) )
            return 0
            ;;
        --reaching-clear-ep)
            COMPREPLY=( $(compgen -W "${DUNITER_REACHING_CLEAR_EP_ARGS}" -- ${cur}) )
            return 0
            ;;
        --home)
            COMPREPLY=( $(compgen -d -- ${cur}) )
            return 0
            ;;
	--keyfile)
            COMPREPLY=( $(compgen -f -- ${cur}) )
            return 0
            ;;

        *)
        ;;
    esac

   # do not complete after mono argument
   if [ "${#COMP_WORDS[@]}" != "2" ]; then
     return
   fi

   COMPREPLY=($(compgen -W "${DUNITER_ARGUMENTS}" -- ${cur}))
   return 0
}

complete -F _duniter_completion duniter
