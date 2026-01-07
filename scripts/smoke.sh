set -e

echo "1) Typecheck"
npx tsc --noEmit

echo "2) Health"
curl -s http://127.0.0.1:3000/health && echo

echo "3) Dashboard"
curl -s http://127.0.0.1:3000/dashboard | head -c 400; echo; echo

echo "4) Events count + last event"
curl -s http://127.0.0.1:3000/events | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); console.log('count=', j.count); console.log('last=', j.events[j.events.length-1]);})"
